import { describe, expect, it } from "vitest";
import type { IAppConfigResponse } from "@badger/types";
import { canShowRegister, shouldLeaveRegisterPage, shouldSyncGoogleSheet } from "./appConfig";

const open: IAppConfigResponse = {
    registrationOpen: true,
    googleSheetsEnabled: true,
    fxEnabled: false,
    attachmentsEnabled: false,
};
const closed: IAppConfigResponse = {
    registrationOpen: false,
    googleSheetsEnabled: false,
    fxEnabled: false,
    attachmentsEnabled: false,
};

describe("canShowRegister", () => {
    it("hides the register link while the config is unknown", () => {
        expect(canShowRegister(undefined)).toBe(false);
    });

    it("shows the register link only when registration is open", () => {
        expect(canShowRegister(open)).toBe(true);
        expect(canShowRegister(closed)).toBe(false);
    });
});

describe("shouldLeaveRegisterPage", () => {
    it("does not redirect while the config is unknown", () => {
        expect(shouldLeaveRegisterPage(undefined)).toBe(false);
    });

    it("redirects only when the config says registration is closed", () => {
        expect(shouldLeaveRegisterPage(closed)).toBe(true);
        expect(shouldLeaveRegisterPage(open)).toBe(false);
    });
});

describe("shouldSyncGoogleSheet", () => {
    it("does not sync while the config is unknown", () => {
        expect(shouldSyncGoogleSheet(undefined, true)).toBe(false);
    });

    it("syncs only when signed in and Google Sheets is enabled", () => {
        expect(shouldSyncGoogleSheet(open, true)).toBe(true);
        expect(shouldSyncGoogleSheet(closed, true)).toBe(false);
        expect(shouldSyncGoogleSheet(open, false)).toBe(false);
    });
});
