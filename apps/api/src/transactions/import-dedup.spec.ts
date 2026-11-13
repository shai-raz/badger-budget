import { Decimal } from "@prisma/client/runtime/library";
import { DedupCandidate, NEAR_DATE_DAYS, StoredRow, matchStoredRows, storedDescription } from "./import-dedup";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const candidate = (overrides: Partial<DedupCandidate> = {}): DedupCandidate => ({
    externalId: "ref-1",
    accountId: "account-1",
    transactionDate: day("2026-06-15"),
    amount: 100,
    description: "Salary",
    ...overrides,
});

let nextRowId = 0;
const stored = (overrides: Partial<StoredRow> = {}): StoredRow => ({
    id: `row-${String(nextRowId++).padStart(6, "0")}`,
    accountId: "account-1",
    externalId: "ref-1",
    transactionDate: day("2026-06-15"),
    postedDate: null,
    amount: new Decimal(100),
    description: "Salary",
    deletedAt: null,
    accountDeleted: false,
    ...overrides,
});

const tiers = (candidates: DedupCandidate[], rows: StoredRow[]) =>
    matchStoredRows(candidates, rows).map((match) => match?.tier ?? null);

describe("matchStoredRows", () => {
    it("treats a candidate with nothing stored as new", () => {
        expect(tiers([candidate()], [])).toEqual([null]);
    });

    it("matches the stored copy of the same transaction", () => {
        expect(tiers([candidate()], [stored()])).toEqual(["identical"]);
    });

    describe("a provider id shared by several transactions", () => {
        it("imports a bank reference reused on a later date (monthly salary)", () => {
            const may = stored({ transactionDate: day("2026-05-15") });
            expect(tiers([candidate({ transactionDate: day("2026-06-15") })], [may])).toEqual([null]);
        });

        it("imports the installments that are not stored yet", () => {
            const first = stored({ externalId: "voucher-9", transactionDate: day("2026-04-02"), description: "Sofa" });
            const installment = (month: string) =>
                candidate({ externalId: "voucher-9", transactionDate: day(`2026-${month}-02`), description: "Sofa" });

            expect(tiers([installment("04"), installment("05"), installment("06")], [first])).toEqual([
                "identical",
                null,
                null,
            ]);
        });

        it("imports a second transaction that reuses the id on the same day", () => {
            expect(tiers([candidate(), candidate()], [stored()])).toEqual(["identical", null]);
        });

        it("imports a row whose id collides with one in another account for a different amount", () => {
            const bankRow = stored({ accountId: "bank-account", amount: new Decimal(4200) });
            expect(tiers([candidate({ accountId: "card-account", amount: 35 })], [bankRow])).toEqual([null]);
        });
    });

    it("imports the second of two identical same-day transactions when only one is stored", () => {
        const firstTransfer = stored({ externalId: "bit-1", description: "Bit" });
        const transfers = [
            candidate({ externalId: "bit-1", description: "Bit" }),
            candidate({ externalId: "bit-2", description: "Bit" }),
        ];
        expect(tiers(transfers, [firstTransfer])).toEqual(["identical", null]);
    });

    it("matches a settled row whose amount changed, in the same account and on the same day", () => {
        expect(tiers([candidate({ amount: 104.5 })], [stored({ amount: new Decimal(100) })])).toEqual(["sameDay"]);
    });

    it("matches a row stored on the legacy day-early date", () => {
        const legacy = stored({ transactionDate: day("2026-06-14") });
        expect(tiers([candidate({ legacyTransactionDate: day("2026-06-14") })], [legacy])).toEqual(["legacyDate"]);
    });

    describe("a row stored under another account", () => {
        const underDeleted = () => stored({ accountId: "deleted-account", accountDeleted: true });

        it("matches when that account is deleted and the day and amount agree", () => {
            expect(tiers([candidate()], [underDeleted()])).toEqual(["otherAccount"]);
        });

        it("matches before the re-created account exists", () => {
            expect(tiers([candidate({ accountId: undefined })], [underDeleted()])).toEqual(["otherAccount"]);
        });

        it("never matches when that account is live", () => {
            expect(tiers([candidate()], [stored({ accountId: "other-live-account" })])).toEqual([null]);
        });
    });

    it("matches a row whose date the bank moved by a few days", () => {
        const shifted = stored({ transactionDate: day("2026-06-13") });
        expect(tiers([candidate()], [shifted])).toEqual(["nearDate"]);
    });

    it(`does not treat a row more than ${NEAR_DATE_DAYS} days away as the same transaction`, () => {
        const far = stored({ transactionDate: day("2026-06-11") });
        expect(tiers([candidate()], [far])).toEqual([null]);
    });

    it("imports a bank row even when a hand-added row (no externalId) looks the same", () => {
        expect(tiers([candidate()], [stored({ externalId: null })])).toEqual([null]);
    });

    it("matches a row whose id the provider changed", () => {
        expect(tiers([candidate({ externalId: "ref-1-2" })], [stored({ externalId: "ref-1" })])).toEqual(["lookAlike"]);
    });

    it("keeps a transaction the user deleted from coming back", () => {
        expect(tiers([candidate()], [stored({ deletedAt: new Date() })])).toEqual(["identical"]);
    });

    it("does not let a deleted look-alike with another id hide a new transaction", () => {
        const deleted = stored({ externalId: "other", deletedAt: new Date() });
        expect(tiers([candidate()], [deleted])).toEqual([null]);
    });

    it("gives a stored row to the candidate that matches it best, whatever the candidate order", () => {
        const row = stored({ amount: new Decimal(20), description: "B" });
        const a = candidate({ amount: 10, description: "A" });
        const b = candidate({ amount: 20, description: "B" });

        expect(tiers([a, b], [row])).toEqual([null, "identical"]);
        expect(tiers([b, a], [row])).toEqual(["identical", null]);
    });

    it("matches each leg of a same-reference transfer between two own accounts to its own row", () => {
        const legA = stored({ accountId: "account-a" });
        const legB = stored({ accountId: "account-b" });
        const matches = matchStoredRows(
            [candidate({ accountId: "account-b" }), candidate({ accountId: "account-a" })],
            [legA, legB],
        );
        expect(matches.map((m) => m?.row.id)).toEqual([legB.id, legA.id]);
    });

    it("imports the missing leg of a same-reference transfer when only one leg is stored", () => {
        const legA = stored({ accountId: "account-a" });
        expect(tiers([candidate({ accountId: "account-b" }), candidate({ accountId: "account-a" })], [legA])).toEqual([
            null,
            "identical",
        ]);
    });

    it("never matches a candidate whose account does not exist yet by account", () => {
        const otherId = stored({ externalId: "other" });
        expect(tiers([candidate({ accountId: undefined })], [otherId])).toEqual([null]);
    });

    it("compares the amount as stored, rounded to 2 decimals", () => {
        const row = stored({ amount: new Decimal("35.9") });
        expect(tiers([candidate({ amount: 35.900000000000006 })], [row])).toEqual(["identical"]);
    });

    it("compares against the description the importer stores for an empty one", () => {
        const row = stored({ description: storedDescription("") });
        expect(tiers([candidate({ description: "" })], [row])).toEqual(["identical"]);
    });

    describe("on random data", () => {
        // mulberry32: a seeded generator, so a failure is reproducible.
        const random = (seed: number) => () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        // Small value sets, so ids, days, amounts and descriptions collide all the time.
        const IDS = ["a", "b", "c"];
        const ACCOUNTS = ["account-1", "account-2"];
        const AMOUNTS = [10, 20];
        const DESCRIPTIONS = ["x", "y"];
        const DAYS = 8;
        const dayAt = (n: number) => new Date(Date.UTC(2026, 5, 1 + n));

        const scenario = (seed: number) => {
            const next = random(seed);
            const pick = <T>(values: T[]): T => values[Math.floor(next() * values.length)];
            const rows: StoredRow[] = Array.from({ length: Math.floor(next() * 9) }, (_, i) => ({
                id: `stored-${seed}-${i}`,
                ...pick<Pick<StoredRow, "accountId" | "accountDeleted">>([
                    ...ACCOUNTS.map((accountId) => ({ accountId, accountDeleted: false })),
                    { accountId: "account-deleted", accountDeleted: true },
                ]),
                externalId: next() < 0.2 ? null : pick(IDS),
                transactionDate: dayAt(Math.floor(next() * DAYS)),
                postedDate: null,
                amount: new Decimal(pick(AMOUNTS)),
                description: pick(DESCRIPTIONS),
                deletedAt: next() < 0.2 ? new Date() : null,
            }));
            const candidates: DedupCandidate[] = Array.from({ length: Math.floor(next() * 9) }, () => {
                const n = Math.floor(next() * DAYS);
                return {
                    externalId: pick(IDS),
                    accountId: pick(ACCOUNTS),
                    transactionDate: dayAt(n),
                    // Like the scraper's, the legacy date depends only on the transaction's own date.
                    legacyTransactionDate: n % 2 === 1 ? dayAt(n - 1) : undefined,
                    amount: pick(AMOUNTS),
                    description: pick(DESCRIPTIONS),
                };
            });
            return { rows, candidates };
        };

        /** What the importer did before: skip on any stored row with the id, else on a live look-alike. */
        const oldLogicSkips = (c: DedupCandidate, rows: StoredRow[]) =>
            rows.some((r) => r.externalId === c.externalId) ||
            rows.some(
                (r) =>
                    !r.deletedAt &&
                    r.accountId === c.accountId &&
                    r.transactionDate.getTime() === c.transactionDate.getTime() &&
                    new Decimal(c.amount).equals(r.amount) &&
                    r.description === c.description,
            );

        const asStoredRow = (c: DedupCandidate, id: string): StoredRow => ({
            id,
            accountId: c.accountId!,
            externalId: c.externalId,
            transactionDate: c.transactionDate,
            postedDate: null,
            amount: new Decimal(c.amount),
            description: storedDescription(c.description),
            deletedAt: null,
            accountDeleted: false,
        });

        const SEEDS = Array.from({ length: 3000 }, (_, i) => i + 1);

        it("never skips a row the old logic imported", () => {
            for (const seed of SEEDS) {
                const { rows, candidates } = scenario(seed);
                matchStoredRows(candidates, rows).forEach((match, i) => {
                    if (match && !oldLogicSkips(candidates[i], rows)) {
                        throw new Error(
                            `seed ${seed}: candidate ${i} is skipped (${match.tier}) but was imported before`,
                        );
                    }
                });
            }
        });

        it("uses each stored row for at most one candidate", () => {
            for (const seed of SEEDS) {
                const { rows, candidates } = scenario(seed);
                const used = matchStoredRows(candidates, rows).flatMap((match) => (match ? [match.row.id] : []));
                expect(new Set(used).size).toBe(used.length);
            }
        });

        it("inserts nothing when the same candidates are imported again, in any order", () => {
            for (const seed of SEEDS) {
                const { rows, candidates } = scenario(seed);
                const inserted = matchStoredRows(candidates, rows).flatMap((match, i) =>
                    // Ids sort unpredictably against the existing rows', as real UUIDs do.
                    match ? [] : [asStoredRow(candidates[i], `${i % 2 ? "zzz" : "000"}-new-${seed}-${i}`)],
                );
                const after = [...inserted, ...rows];

                for (const again of [candidates, [...candidates].reverse()]) {
                    const stillNew = matchStoredRows(again, after).filter((match) => !match).length;
                    if (stillNew > 0) throw new Error(`seed ${seed}: ${stillNew} row(s) inserted on a repeated import`);
                }
            }
        });
    });
});
