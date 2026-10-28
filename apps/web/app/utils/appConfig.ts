import type { IAppConfigResponse, IAuthUser } from "@badger/types";
import { DEMO_EMAIL } from "@badger/shared-data";

/** Show the register link only once the config confirms registration is open (hidden while loading or on error). */
export function canShowRegister(config: IAppConfigResponse | undefined): boolean {
    return config?.registrationOpen === true;
}

/** Leave /auth/register only after the config has loaded and says registration is closed. */
export function shouldLeaveRegisterPage(config: IAppConfigResponse | undefined): boolean {
    return config !== undefined && !config.registrationOpen;
}

/** Run the Google Sheets sync only for a signed-in user on an instance where Sheets is configured. */
export function shouldSyncGoogleSheet(config: IAppConfigResponse | undefined, isAuthenticated: boolean): boolean {
    return isAuthenticated && config?.googleSheetsEnabled === true;
}

/** Attachment UI (upload, preview, download) only when the config confirms storage is set up (hidden while loading or on error). */
export function canUseAttachmentStorage(config: IAppConfigResponse | undefined): boolean {
    return config?.attachmentsEnabled === true;
}

/** The demo account is read-only for attachments, like its other shared data. */
export function isDemoUser(user: Pick<IAuthUser, "email"> | null | undefined): boolean {
    return user?.email === DEMO_EMAIL;
}

export type AttachmentUploadBlock = "disabled" | "demo" | "mirror" | null;

/** Why attachments can't be added to a transaction right now, checked in order: disabled, demo, mirror. Null when they can. */
export function attachmentUploadBlock(
    config: IAppConfigResponse | undefined,
    user: Pick<IAuthUser, "email"> | null | undefined,
    isMirror: boolean,
): AttachmentUploadBlock {
    if (!canUseAttachmentStorage(config)) return "disabled";
    if (isDemoUser(user)) return "demo";
    if (isMirror) return "mirror";
    return null;
}

export const ATTACHMENT_BLOCK_NOTE: Record<Exclude<AttachmentUploadBlock, null>, string> = {
    disabled: "File storage isn't configured on this server.",
    demo: "Uploads are disabled on the demo account.",
    mirror: "Add files on the source transaction.",
};
