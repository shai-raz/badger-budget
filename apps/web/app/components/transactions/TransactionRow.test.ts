// Source-text contract for the row's attachment count. The web test runner is Vitest in a node environment with no DOM,
// so the markup is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("TransactionRow attachment count", () => {
    const row = source("./TransactionRow.vue");
    // The muted sub-line under the description: date, account or category, then the optional paperclip count.
    const subLineStart = row.indexOf('<div class="truncate text-[12.5px] text-muted-color">');
    const subLineEnd = row.indexOf("</div>", subLineStart);
    const subLine = row.slice(subLineStart, subLineEnd);

    it("finds the muted sub-line block", () => {
        expect(subLineStart).toBeGreaterThan(-1);
        expect(subLineEnd).toBeGreaterThan(subLineStart);
    });

    it("shows the paperclip and count only when the transaction has attachments", () => {
        expect(subLine).toContain("attachmentCount > 0");
        expect(subLine).toContain("pi-paperclip");
    });

    it("ends the sub-line after the date and account or category text", () => {
        const dateAt = subLine.indexOf("formatDate(");
        const countAt = subLine.indexOf("attachmentCount > 0");
        expect(dateAt).toBeGreaterThan(-1);
        expect(countAt).toBeGreaterThan(dateAt);
    });

    it("keeps the count inside the sub-line rather than adding a column", () => {
        expect(subLine.slice(1)).not.toContain("<div");
        expect(row.split("pi-paperclip").length - 1).toBe(1);
    });

    it("announces the count to screen readers with a singular or plural label", () => {
        expect(subLine).toContain('"attachment" : "attachments"');
        expect(subLine).toContain('class="sr-only"');
    });
});
