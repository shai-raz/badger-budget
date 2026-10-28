import { describe, expect, it } from "vitest";
import type { IAppConfigResponse } from "@badger/types";
import { DEMO_EMAIL } from "@badger/shared-data";
import {
    ATTACHMENT_BLOCK_NOTE,
    attachmentUploadBlock,
    canShowRegister,
    canUseAttachmentStorage,
    isDemoUser,
    shouldLeaveRegisterPage,
    shouldSyncGoogleSheet,
} from "./appConfig";

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
const withAttachments: IAppConfigResponse = { ...closed, attachmentsEnabled: true };
const member = { email: "someone@example.com" };
const demo = { email: DEMO_EMAIL };

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

describe("canUseAttachmentStorage", () => {
    it("hides attachment UI while the config is unknown", () => {
        expect(canUseAttachmentStorage(undefined)).toBe(false);
    });

    it("enables attachment UI only when the config says storage is on", () => {
        expect(canUseAttachmentStorage(withAttachments)).toBe(true);
        expect(canUseAttachmentStorage(closed)).toBe(false);
    });
});

describe("isDemoUser", () => {
    it("matches the demo account email only", () => {
        expect(isDemoUser(demo)).toBe(true);
        expect(isDemoUser(member)).toBe(false);
        expect(isDemoUser(null)).toBe(false);
        expect(isDemoUser(undefined)).toBe(false);
    });
});

describe("attachmentUploadBlock", () => {
    it("is null when uploads are allowed", () => {
        expect(attachmentUploadBlock(withAttachments, member, false)).toBeNull();
    });

    it("blocks everything with 'disabled' when the config is unknown or storage is off", () => {
        expect(attachmentUploadBlock(undefined, member, false)).toBe("disabled");
        expect(attachmentUploadBlock(closed, demo, true)).toBe("disabled");
    });

    it("blocks the demo account with 'demo'", () => {
        expect(attachmentUploadBlock(withAttachments, demo, false)).toBe("demo");
    });

    it("blocks mirror transactions with 'mirror'", () => {
        expect(attachmentUploadBlock(withAttachments, member, true)).toBe("mirror");
    });

    it("checks disabled, then demo, then mirror", () => {
        expect(attachmentUploadBlock(withAttachments, demo, true)).toBe("demo");
    });

    it("has a note for every block", () => {
        expect(Object.keys(ATTACHMENT_BLOCK_NOTE).sort()).toEqual(["demo", "disabled", "mirror"]);
    });
});
