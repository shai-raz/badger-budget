import { describe, expect, it } from "vitest";
import { connectionSubtitle, providerName, shouldAutoSyncAfterSave } from "./bankConnections";

describe("shouldAutoSyncAfterSave", () => {
    it.each([
        { updateLogin: true, credentialsChanged: true, isActive: true, expected: true },
        { updateLogin: true, credentialsChanged: true, isActive: false, expected: false },
        { updateLogin: true, credentialsChanged: false, isActive: true, expected: false },
        { updateLogin: true, credentialsChanged: false, isActive: false, expected: false },
        { updateLogin: false, credentialsChanged: true, isActive: true, expected: false },
        { updateLogin: false, credentialsChanged: true, isActive: false, expected: false },
        { updateLogin: false, credentialsChanged: false, isActive: true, expected: false },
        { updateLogin: false, credentialsChanged: false, isActive: false, expected: false },
    ])(
        "updateLogin=$updateLogin credentialsChanged=$credentialsChanged isActive=$isActive -> $expected",
        ({ updateLogin, credentialsChanged, isActive, expected }) => {
            expect(shouldAutoSyncAfterSave({ updateLogin, credentialsChanged, isActive })).toBe(expected);
        },
    );
});

describe("providerName", () => {
    it("returns the provider's display name for a known id", () => {
        expect(providerName("visaCal")).toBe("Visa Cal");
    });

    it("falls back to the id for an unknown provider", () => {
        expect(providerName("unknownBank")).toBe("unknownBank");
    });
});

describe("connectionSubtitle", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const hoursBefore = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
    const daysBefore = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    it("shows the provider and the compact sync age", () => {
        expect(connectionSubtitle({ companyId: "visaCal", lastSyncedAt: hoursBefore(3) }, now)).toEqual({
            provider: "Visa Cal",
            syncAge: "Synced 3h ago",
            stale: false,
        });
    });

    it("flags a sync older than three days as stale", () => {
        expect(connectionSubtitle({ companyId: "visaCal", lastSyncedAt: daysBefore(5) }, now)).toEqual({
            provider: "Visa Cal",
            syncAge: "Synced 5d ago",
            stale: true,
        });
    });

    it("does not flag a sync exactly three days old", () => {
        expect(connectionSubtitle({ companyId: "visaCal", lastSyncedAt: daysBefore(3) }, now).stale).toBe(false);
    });

    it("says never synced, and is never stale, when there is no sync yet", () => {
        expect(connectionSubtitle({ companyId: "visaCal", lastSyncedAt: null }, now)).toEqual({
            provider: "Visa Cal",
            syncAge: "Never synced",
            stale: false,
        });
    });

    it("uses the raw id for an unknown provider", () => {
        expect(connectionSubtitle({ companyId: "unknownBank", lastSyncedAt: null }, now).provider).toBe("unknownBank");
    });
});
