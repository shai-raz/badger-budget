import { extractAccountBalances } from "./scraped-balance.util";

describe("extractAccountBalances", () => {
    it("extracts a balance with its date", () => {
        const result = extractAccountBalances([{ accountNumber: "1234", balance: 1500.55, balanceDate: "2026-10-02" }]);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ accountNumber: "1234", amount: 1500.55, isSavings: false });
        expect(result[0].balanceDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    });

    it("pins a bare date string to UTC midnight", () => {
        const result = extractAccountBalances([{ accountNumber: "1234", balance: 10, balanceDate: "2026-10-02" }]);

        expect(result[0].balanceDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    });

    it("pins a timezone-less balanceDate to UTC midnight (the max/Cal shape that could otherwise shift a day)", () => {
        const result = extractAccountBalances([
            { accountNumber: "1234", balance: 10, balanceDate: "2026-10-02T00:00:00" },
        ]);

        expect(result[0].balanceDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    });

    it("pins a balanceDate with an explicit offset to UTC midnight of its own calendar day", () => {
        const result = extractAccountBalances([
            { accountNumber: "1234", balance: 10, balanceDate: "2026-10-02T23:30:00+03:00" },
        ]);

        expect(result[0].balanceDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    });

    it("normalizes a Date instance built at local midnight to UTC midnight of the same calendar day", () => {
        const result = extractAccountBalances([
            { accountNumber: "1234", balance: 10, balanceDate: new Date(2026, 9, 2) },
        ]);

        expect(result[0].balanceDate?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    });

    it("nulls an out-of-range date string rather than letting Date.UTC roll it into another month", () => {
        const result = extractAccountBalances([{ accountNumber: "1234", balance: 10, balanceDate: "2026-13-45" }]);

        expect(result[0].balanceDate).toBeNull();
    });

    it("skips NaN balances (mizrahi computes `+fields?.Yitra`, which is NaN when the field is missing)", () => {
        expect(extractAccountBalances([{ accountNumber: "1234", balance: NaN }])).toEqual([]);
    });

    it("skips non-finite balances from failed DOM parseFloat scrapes", () => {
        expect(extractAccountBalances([{ accountNumber: "1234", balance: Infinity }])).toEqual([]);
    });

    it("skips accounts with no balance (union and yahav never set one)", () => {
        expect(extractAccountBalances([{ accountNumber: "1234", txns: [] }])).toEqual([]);
        expect(extractAccountBalances([{ accountNumber: "1234", balance: null }])).toEqual([]);
    });

    it("keeps zero and negative balances (overdrafts, and card debt which IBS negates)", () => {
        const result = extractAccountBalances([
            { accountNumber: "zero", balance: 0 },
            { accountNumber: "card", balance: -4210.5 },
        ]);

        expect(result.map((b) => b.amount)).toEqual([0, -4210.5]);
    });

    it("nulls an unparseable balanceDate rather than storing an Invalid Date", () => {
        const result = extractAccountBalances([{ accountNumber: "1234", balance: 10, balanceDate: "not-a-date" }]);

        expect(result[0].balanceDate).toBeNull();
    });

    it("flags savings accounts (leumi returns these with txns: [])", () => {
        const result = extractAccountBalances([
            { accountNumber: "123-45", balance: 90000, savingsAccount: true, txns: [] },
        ]);

        expect(result[0]).toMatchObject({ accountNumber: "123-45", amount: 90000, isSavings: true });
    });

    it("ignores malformed entries and accounts with no usable account number", () => {
        expect(extractAccountBalances([null, undefined, "nope", {}, { accountNumber: "", balance: 5 }])).toEqual([]);
    });

    describe("cardFrame", () => {
        it("captures the card's credit limit", () => {
            const result = extractAccountBalances([{ accountNumber: "4580", balance: -4210.5, cardFrame: 15000 }]);

            expect(result[0].cardFrame).toBe(15000);
        });

        it("nulls a zero frame (Isracard reports 0 for a cancelled card, not a zero limit)", () => {
            const result = extractAccountBalances([{ accountNumber: "4580", balance: -100, cardFrame: 0 }]);

            expect(result[0].cardFrame).toBeNull();
        });

        it("nulls a negative frame", () => {
            const result = extractAccountBalances([{ accountNumber: "4580", balance: -100, cardFrame: -5000 }]);

            expect(result[0].cardFrame).toBeNull();
        });

        it("nulls a non-numeric or non-finite frame", () => {
            const result = extractAccountBalances([
                { accountNumber: "a", balance: -100, cardFrame: "15000" },
                { accountNumber: "b", balance: -100, cardFrame: NaN },
                { accountNumber: "c", balance: -100, cardFrame: Infinity },
            ]);

            expect(result.map((b) => b.cardFrame)).toEqual([null, null, null]);
        });

        it("nulls the frame for a bank account, which never reports one", () => {
            const result = extractAccountBalances([{ accountNumber: "12-345", balance: 8000 }]);

            expect(result[0].cardFrame).toBeNull();
        });

        it("still skips an account that has a frame but no balance", () => {
            // The NOT NULL `amount` column is what forces this: a frame-only snapshot has no
            // balance to store, so the whole account is dropped rather than half-recorded.
            expect(extractAccountBalances([{ accountNumber: "4580", cardFrame: 15000 }])).toEqual([]);
        });
    });

    describe("cardIssuer", () => {
        it("captures IBS's cardType (Cal reports it)", () => {
            const result = extractAccountBalances([
                { accountNumber: "a", balance: -100, cardType: "bankIssued" },
                { accountNumber: "b", balance: -100, cardType: "companyIssued", cardFrame: 15000 },
            ]);

            expect(result.map((b) => b.cardIssuer)).toEqual(["bankIssued", "companyIssued"]);
        });

        it("rejects an unrecognized cardType rather than storing it", () => {
            const result = extractAccountBalances([
                { accountNumber: "a", balance: -100, cardType: "somethingElse" },
                { accountNumber: "b", balance: -100 },
            ]);

            expect(result.map((b) => b.cardIssuer)).toEqual([null, null]);
        });

        it("drops a frame-less companyIssued, which is Cal's else-branch default rather than an observation", () => {
            const result = extractAccountBalances([
                { accountNumber: "a", balance: -100, cardType: "companyIssued" },
                { accountNumber: "b", balance: -100, cardType: "companyIssued", cardFrame: 0 },
            ]);

            expect(result.map((b) => b.cardIssuer)).toEqual([null, null]);
        });

        it("keeps bankIssued even without a frame, since it's never gated on one", () => {
            const result = extractAccountBalances([{ accountNumber: "a", balance: -100, cardType: "bankIssued" }]);

            expect(result.map((b) => b.cardIssuer)).toEqual(["bankIssued"]);
        });
    });

    describe("isracard balanceDate year roll-forward", () => {
        // IBS parses isracard's `לחיוב ב-DD/MM` with no year, so moment stamps the current one and
        // a December scrape of a January charge date lands ~11 months in the past.
        const isoOf = (d: Date | null) => d?.toISOString();

        it("rolls a clearly-stale isracard date forward a year", () => {
            jest.useFakeTimers().setSystemTime(new Date("2026-12-10T09:00:00Z"));
            try {
                const result = extractAccountBalances(
                    [{ accountNumber: "4580", balance: -100, balanceDate: "2026-01-02" }],
                    "isracard",
                );

                expect(isoOf(result[0].balanceDate)).toBe("2027-01-02T00:00:00.000Z");
            } finally {
                jest.useRealTimers();
            }
        });

        it("leaves a same-year isracard date alone", () => {
            jest.useFakeTimers().setSystemTime(new Date("2026-12-10T09:00:00Z"));
            try {
                const result = extractAccountBalances(
                    [{ accountNumber: "4580", balance: -100, balanceDate: "2026-12-02" }],
                    "isracard",
                );

                expect(isoOf(result[0].balanceDate)).toBe("2026-12-02T00:00:00.000Z");
            } finally {
                jest.useRealTimers();
            }
        });

        it("does not roll an equally-old amex or cal date — theirs carry a real year", () => {
            jest.useFakeTimers().setSystemTime(new Date("2026-12-10T09:00:00Z"));
            try {
                const amex = extractAccountBalances(
                    [{ accountNumber: "4580", balance: -100, balanceDate: "2026-01-02" }],
                    "amex",
                );
                const cal = extractAccountBalances(
                    [{ accountNumber: "4580", balance: -100, balanceDate: "2026-01-02" }],
                    "visaCal",
                );

                expect(isoOf(amex[0].balanceDate)).toBe("2026-01-02T00:00:00.000Z");
                expect(isoOf(cal[0].balanceDate)).toBe("2026-01-02T00:00:00.000Z");
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
