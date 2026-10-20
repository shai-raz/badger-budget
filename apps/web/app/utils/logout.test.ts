import { describe, expect, it, vi } from "vitest";
import { LOGIN_PATH, runLogout } from "./logout";

describe("runLogout", () => {
    it("closes, signs out, then navigates to login in that order", async () => {
        const calls: string[] = [];
        await runLogout({
            close: () => {
                calls.push("close");
            },
            logout: vi.fn(async () => {
                calls.push("logout");
            }),
            navigate: vi.fn(async (path: string) => {
                calls.push(`navigate:${path}`);
            }),
        });
        expect(calls).toEqual(["close", "logout", `navigate:${LOGIN_PATH}`]);
    });

    it("navigates to login only after the sign-out promise resolves", async () => {
        let resolveLogout: () => void = () => {};
        const logout = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveLogout = resolve;
                }),
        );
        const navigate = vi.fn();

        const done = runLogout({ logout, navigate });
        await Promise.resolve();
        expect(navigate).not.toHaveBeenCalled();

        resolveLogout();
        await done;
        expect(navigate).toHaveBeenCalledWith("/auth/login");
    });

    it("works without a close callback", async () => {
        const logout = vi.fn(async () => {});
        const navigate = vi.fn();
        await runLogout({ logout, navigate });
        expect(logout).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith("/auth/login");
    });

    // Regression: `@click="logout"` passes a MouseEvent as the first argument, which used to throw
    // "deps.close is not a function" before signing out.
    it("ignores a non-function close, such as a click event, and still signs out", async () => {
        const logout = vi.fn(async () => {});
        const navigate = vi.fn();
        const clickEvent = { type: "click" } as unknown as () => void;
        await runLogout({ close: clickEvent, logout, navigate });
        expect(logout).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith(LOGIN_PATH);
    });

    it("never navigates to the retired /logout route", async () => {
        const navigate = vi.fn();
        await runLogout({ logout: async () => {}, navigate });
        expect(navigate).not.toHaveBeenCalledWith("/logout");
        expect(LOGIN_PATH).toBe("/auth/login");
    });
});
