/** GET /api/v1/system/info and POST /api/v1/system/check-updates. */
export interface ISystemInfo {
    /** e.g. "0.3.1", "0.3.1-3-gabc1234", "0.3.0-dev"; null when unknown. */
    version: string | null;
    /** Full git SHA from the build; null for builds without GIT_SHA. */
    commit: string | null;
    /** Latest release version without the leading v, e.g. "0.4.0". */
    latest: string | null;
    updateAvailable: boolean;
    /** False for -dev and unknown builds, which never get update notices. */
    updateComparable: boolean;
    /** ISO time of the last successful check. */
    checkedAt: string | null;
    updateCheckEnabled: boolean;
    /** html_url of the latest release. */
    releaseUrl: string | null;
}
