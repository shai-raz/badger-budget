import { ForbiddenException } from "@nestjs/common";
import { McpOriginGuard } from "./mcp-origin.guard";
import { httpContext } from "./test-helpers";

describe("McpOriginGuard", () => {
    const guard = new McpOriginGuard();
    const check = (origin?: string) => guard.canActivate(httpContext({ headers: origin ? { origin } : {} }));

    it.each([undefined, "http://localhost:6274", "http://127.0.0.1:9999", "https://localhost", "http://[::1]:5173"])(
        "allows %s",
        (origin) => {
            expect(check(origin)).toBe(true);
        },
    );

    it("allows an allowlisted app origin", () => {
        expect(check("http://localhost:3001")).toBe(true);
    });

    it.each(["https://evil.example", "http://localhost.evil.example", "http://localhost:3001.evil.example", "null"])(
        "rejects %s with 403",
        (origin) => {
            expect(() => check(origin)).toThrow(ForbiddenException);
            expect(() => check(origin)).toThrow("Origin not allowed");
        },
    );
});
