import { contentDispositionFor } from "./content-disposition";

describe("contentDispositionFor", () => {
    it("returns inline for inline", () => {
        expect(contentDispositionFor("inline", "receipt.pdf")).toBe("inline");
    });

    it("gives an ASCII name the same value in filename and filename*", () => {
        expect(contentDispositionFor("attachment", "receipt.pdf")).toBe(
            `attachment; filename="receipt.pdf"; filename*=UTF-8''receipt.pdf`,
        );
    });

    it("falls back to underscores in filename and encodes the UTF-8 name in filename*", () => {
        expect(contentDispositionFor("attachment", "קבלה.pdf")).toBe(
            `attachment; filename="____.pdf"; filename*=UTF-8''%D7%A7%D7%91%D7%9C%D7%94.pdf`,
        );
    });

    it("replaces quotes and backslashes in the fallback and encodes RFC 5987 reserved characters", () => {
        expect(contentDispositionFor("attachment", `a"b\\c (1)*'.pdf`)).toBe(
            `attachment; filename="a_b_c (1)*'.pdf"; filename*=UTF-8''a%22b%5Cc%20%281%29%2A%27.pdf`,
        );
    });

    it("replaces control characters in the fallback", () => {
        expect(contentDispositionFor("attachment", "a\tb.pdf")).toBe(
            `attachment; filename="a_b.pdf"; filename*=UTF-8''a%09b.pdf`,
        );
    });
});
