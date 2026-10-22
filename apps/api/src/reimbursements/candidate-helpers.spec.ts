import { mergeNearest, parseSearchAmount } from "./candidate-helpers";

describe("parseSearchAmount", () => {
    it.each([
        ["1200", 1200],
        ["₪1,200", 1200],
        ["$ 1,200.50", 1200.5],
        ["120.5", 120.5],
        ["  99.99 ", 99.99],
    ])("reads %j as %d", (input, expected) => {
        expect(parseSearchAmount(input)).toBe(expected);
    });

    it.each(["taizu", "12a", "1.234", "-5", "", "1.2.3", "12,34.5x"])("returns null for %j", (input) => {
        expect(parseSearchAmount(input)).toBeNull();
    });
});

describe("mergeNearest", () => {
    const anchor = new Date("2026-10-10T00:00:00Z");
    const row = (id: string, date: string) => ({ id, transactionDate: new Date(date) });

    it("orders before and after rows by distance from the anchor", () => {
        const before = [row("b-near", "2026-10-09"), row("b-far", "2026-10-01")];
        const after = [row("a-near", "2026-10-12"), row("a-far", "2026-11-01")];

        const merged = mergeNearest(before, after, anchor, 10);

        expect(merged.map((r) => r.id)).toEqual(["b-near", "a-near", "b-far", "a-far"]);
    });

    it("breaks distance ties by later date first, then id", () => {
        const before = [row("z", "2026-10-09"), row("a", "2026-10-09")];
        const after = [row("m", "2026-10-11")];

        const merged = mergeNearest(before, after, anchor, 10);

        expect(merged.map((r) => r.id)).toEqual(["m", "a", "z"]);
    });

    it("keeps at most limit rows", () => {
        const before = [row("b1", "2026-10-09"), row("b2", "2026-10-08")];
        const after = [row("a1", "2026-10-11"), row("a2", "2026-10-12")];

        // b1 and a1 are both one day away; the later date wins the tie.
        expect(mergeNearest(before, after, anchor, 2).map((r) => r.id)).toEqual(["a1", "b1"]);
    });
});
