import { describe, expect, it } from "vitest";
import { shouldAutoSyncAfterSave } from "./bankConnections";

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
