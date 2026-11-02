import { describe, expect, it } from "vitest";
import { connectionSubtitle, providerName, shouldAutoSyncAfterSave } from "./bankConnections";

describe("shouldAutoSyncAfterSave", () => {
    it.each([
        { credentialsChanged: true, isActive: true, expected: true },
        { credentialsChanged: true, isActive: false, expected: false },
        { credentialsChanged: false, isActive: true, expected: false },
        { credentialsChanged: false, isActive: false, expected: false },
    ])(
        "credentialsChanged=$credentialsChanged isActive=$isActive -> $expected",
        ({ credentialsChanged, isActive, expected }) => {
            expect(shouldAutoSyncAfterSave({ credentialsChanged, isActive })).toBe(expected);
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
    const formatDate = (d: Date) => d.toISOString().slice(0, 10);

    it("shows the provider and the last sync time", () => {
        expect(
            connectionSubtitle({ companyId: "visaCal", lastSyncedAt: new Date("2026-10-02T08:00:00Z") }, formatDate),
        ).toBe("Visa Cal · Last synced 2026-10-02");
    });

    it("says never synced when there is no sync yet", () => {
        expect(connectionSubtitle({ companyId: "visaCal", lastSyncedAt: null }, formatDate)).toBe(
            "Visa Cal · Never synced",
        );
    });

    it("uses the raw id for an unknown provider", () => {
        expect(connectionSubtitle({ companyId: "unknownBank", lastSyncedAt: null }, formatDate)).toBe(
            "unknownBank · Never synced",
        );
    });
});
