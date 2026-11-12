/** Maximum number of sync passkeys a user may register (enforced by the API, mirrored in the web UI). */
export const MAX_PASSKEYS = 10;

/** Message of the 401 the API returns for a wrong sync PIN (the api-client must not treat it as an expired session). */
export const INVALID_PIN_MESSAGE = "Invalid PIN";
