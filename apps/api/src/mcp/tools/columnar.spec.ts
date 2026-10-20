import { maskAccountNumber, round2, toColumnar, toIsoDate } from "./columnar";

describe("columnar", () => {
    it("maps undefined to null and counts rows", () => {
        const r = toColumnar(["a", "b"], [{ a: 1 }, { a: 2, b: "x" }]);
        expect(r.rows).toEqual([
            [1, null],
            [2, "x"],
        ]);
        expect(r.rowCount).toBe(2);
        expect(r.truncated).toBe(false);
    });

    it("spreads extra last", () => {
        const r = toColumnar(["a"], [{ a: 1 }], { truncated: true, total: 5 });
        expect(r.truncated).toBe(true);
        expect(r.total).toBe(5);
    });

    it("formats dates and rounds", () => {
        expect(toIsoDate(new Date("2024-03-05T10:00:00Z"))).toBe("2024-03-05");
        expect(toIsoDate(null)).toBeNull();
        expect(round2(1.005)).toBe(1.01);
    });

    it("masks account numbers", () => {
        expect(maskAccountNumber(null)).toBeNull();
        expect(maskAccountNumber("")).toBeNull();
        expect(maskAccountNumber("1234")).toBe("****");
        expect(maskAccountNumber("123456789")).toBe("****6789");
    });
});
