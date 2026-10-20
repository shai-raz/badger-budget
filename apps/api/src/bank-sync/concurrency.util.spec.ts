import { mapWithConcurrency } from "./concurrency.util";

describe("mapWithConcurrency", () => {
    it("resolves all items and preserves order", async () => {
        const items = [1, 2, 3, 4, 5];
        const results = await mapWithConcurrency(items, 3, async (x) => x * 2);
        expect(results.map((r) => (r.ok ? r.value : null))).toEqual([2, 4, 6, 8, 10]);
    });

    it("never exceeds the concurrency limit", async () => {
        let inFlight = 0;
        let peakInFlight = 0;

        const items = Array.from({ length: 10 }, (_, i) => i);
        await mapWithConcurrency(items, 3, async () => {
            inFlight++;
            peakInFlight = Math.max(peakInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 10));
            inFlight--;
        });

        expect(peakInFlight).toBeLessThanOrEqual(3);
    });

    it("captures per-item errors without rejecting the batch", async () => {
        const items = [1, 2, 3];
        const results = await mapWithConcurrency(items, 2, async (x) => {
            if (x === 2) throw new Error("boom");
            return x * 10;
        });

        expect(results[0]).toMatchObject({ ok: true, value: 10 });
        expect(results[1]).toMatchObject({ ok: false });
        expect((results[1] as any).error).toBeInstanceOf(Error);
        expect(results[2]).toMatchObject({ ok: true, value: 30 });
    });

    it("floors limit to 1 for non-positive values", async () => {
        let peakInFlight = 0;
        let inFlight = 0;

        const items = [1, 2, 3];
        await mapWithConcurrency(items, 0, async () => {
            inFlight++;
            peakInFlight = Math.max(peakInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
        });

        expect(peakInFlight).toBe(1);
    });

    it("handles empty input", async () => {
        const results = await mapWithConcurrency([], 5, async (x) => x);
        expect(results).toEqual([]);
    });
});
