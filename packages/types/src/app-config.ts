/** Public instance configuration (feature flags) returned by GET /api/v1/config. */
export interface IAppConfigResponse {
    /** Whether new accounts can be created on this instance right now. */
    registrationOpen: boolean;
    /** Whether the Google Sheets integration has service-account credentials configured. */
    googleSheetsEnabled: boolean;
    /** Whether a FREE_CURRENCY_API_KEY is configured for live FX rates. */
    fxEnabled: boolean;
    /** Whether transaction attachments can be uploaded: the ATTACHMENTS_S3_* storage is configured. */
    attachmentsEnabled: boolean;
}
