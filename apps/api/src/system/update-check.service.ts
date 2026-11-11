import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { normalizeVersion } from "./version";

const DEFAULT_REPO = "shai-raz/badger-budget";
const CHECK_TTL_MS = 60 * 60 * 1000;
const CHECK_TICK_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
const FORCE_COOLDOWN_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export interface LatestRelease {
    version: string;
    url: string;
}

export interface UpdateCheckResult {
    latest: LatestRelease | null;
    checkedAt: Date | null;
}

/** Called with each release a successful check returns. Failures are logged by the service and never rethrown. */
export type UpdateCheckListener = (latest: LatestRelease) => void | Promise<void>;

/**
 * Looks up the latest GitHub release at most once an hour and keeps the answer in memory. Lookups happen lazily on
 * read and in a background tick. Never throws: a failed lookup keeps the previous answer and is retried after
 * FAILURE_RETRY_MS. UPDATE_CHECK=false turns it off, with no outbound request at all.
 */
@Injectable()
export class UpdateCheckService implements OnApplicationBootstrap {
    private readonly logger = new Logger(UpdateCheckService.name);
    private latest: LatestRelease | null = null;
    /** Time of the last successful check. */
    private checkedAt: Date | null = null;
    /** Time of the last attempt, successful or not. Drives the force cooldown and the failure retry. */
    private lastAttemptAt: number | null = null;
    private lastFailed = false;
    private inFlight: Promise<void> | null = null;
    private readonly listeners: UpdateCheckListener[] = [];

    constructor(private readonly config: ConfigService) {}

    /** Warms the cache in the background so the first About card does not wait on GitHub. */
    onApplicationBootstrap(): void {
        if (this.isEnabled()) void this.getLatest();
    }

    /**
     * The tick only refreshes a stale cache, so lazy and background checks share one hourly budget (at most one
     * GitHub request per hour, at least one per ~65 min without traffic). An exactly hourly timer could fire a few
     * ms before the TTL and skip a whole period. Never throws.
     */
    @Interval(CHECK_TICK_MS)
    async tick(): Promise<void> {
        if (this.isEnabled()) await this.getLatest();
    }

    /** Runs the listener after each successful fetch, including when the release is unchanged. */
    onSuccessfulCheck(listener: UpdateCheckListener): void {
        this.listeners.push(listener);
    }

    /** False only when UPDATE_CHECK is "false" (any case, surrounding spaces allowed). Unset or empty means on. */
    isEnabled(): boolean {
        return this.config.get<string>("UPDATE_CHECK")?.trim().toLowerCase() !== "false";
    }

    /** UPDATE_CHECK_REPO ("owner/name") for forks; the upstream repo otherwise. */
    getRepo(): string {
        return this.config.get<string>("UPDATE_CHECK_REPO")?.trim() || DEFAULT_REPO;
    }

    /** Cached release, refreshed first when the cache is stale. */
    async getLatest(): Promise<UpdateCheckResult> {
        if (!this.isEnabled()) return { latest: null, checkedAt: null };
        if (this.isStale()) await this.refresh();
        return this.snapshot();
    }

    /** Checks now, unless any check ran in the last FORCE_COOLDOWN_MS (server-wide). */
    async forceCheck(): Promise<UpdateCheckResult> {
        if (!this.isEnabled()) return { latest: null, checkedAt: null };
        // A refresh already in flight counts as this check: wait for its result instead of returning the old snapshot.
        if (this.inFlight) await this.inFlight;
        const sinceAttempt = this.lastAttemptAt === null ? Infinity : Date.now() - this.lastAttemptAt;
        if (sinceAttempt >= FORCE_COOLDOWN_MS) await this.refresh();
        return this.snapshot();
    }

    private isStale(): boolean {
        if (this.lastAttemptAt === null) return true;
        const now = Date.now();
        if (this.lastFailed) return now - this.lastAttemptAt >= FAILURE_RETRY_MS;
        return this.checkedAt === null || now - this.checkedAt.getTime() >= CHECK_TTL_MS;
    }

    /** Concurrent callers share one request. */
    private refresh(): Promise<void> {
        this.inFlight ??= this.fetchLatest().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async fetchLatest(): Promise<void> {
        this.lastAttemptAt = Date.now();
        let latest: LatestRelease;
        try {
            const response = await fetch(`https://api.github.com/repos/${this.getRepo()}/releases/latest`, {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": "badger-budget-update-check",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`GitHub responded ${response.status}`);

            const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
            if (typeof release.tag_name !== "string" || typeof release.html_url !== "string") {
                throw new Error("unexpected release payload");
            }
            latest = { version: normalizeVersion(release.tag_name), url: release.html_url };
        } catch (error) {
            this.lastFailed = true;
            this.logger.warn(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        this.latest = latest;
        this.checkedAt = new Date();
        this.lastFailed = false;
        await this.notifyListeners(latest);
    }

    private async notifyListeners(latest: LatestRelease): Promise<void> {
        for (const listener of this.listeners) {
            try {
                await listener(latest);
            } catch (error) {
                this.logger.error(
                    `Update check listener failed: ${error instanceof Error ? error.message : String(error)}`,
                    error instanceof Error ? error.stack : undefined,
                );
            }
        }
    }

    private snapshot(): UpdateCheckResult {
        return { latest: this.latest, checkedAt: this.checkedAt };
    }
}
