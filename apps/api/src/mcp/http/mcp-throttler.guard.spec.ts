import { McpThrottlerGuard } from "./mcp-throttler.guard";

describe("McpThrottlerGuard", () => {
    // getTracker does not use the injected throttler collaborators.
    const guard = Object.create(McpThrottlerGuard.prototype) as { getTracker(req: object): Promise<string> };

    it("tracks per user (not per grant) when authenticated", async () => {
        await expect(guard.getTracker({ mcpAuth: { grantId: "g1", userId: "u1" }, ip: "1.2.3.4" })).resolves.toBe(
            "user:u1",
        );
        await expect(guard.getTracker({ mcpAuth: { grantId: "g2", userId: "u1" }, ip: "1.2.3.4" })).resolves.toBe(
            "user:u1",
        );
    });

    it("tracks per ip otherwise", async () => {
        await expect(guard.getTracker({ ip: "1.2.3.4" })).resolves.toBe("ip:1.2.3.4");
    });
});
