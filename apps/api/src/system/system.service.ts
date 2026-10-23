import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ISystemInfo } from "@badger/types";
import { RunningVersion, readApiPackageVersion, resolveRunningVersion } from "./running-version";
import { UpdateCheckResult, UpdateCheckService } from "./update-check.service";
import { isComparable, isUpdateAvailable } from "./version";

@Injectable()
export class SystemService {
    private readonly running: RunningVersion;

    constructor(
        config: ConfigService,
        private readonly updateCheck: UpdateCheckService,
    ) {
        this.running = resolveRunningVersion(
            { APP_VERSION: config.get<string>("APP_VERSION"), GIT_SHA: config.get<string>("GIT_SHA") },
            readApiPackageVersion,
        );
    }

    /** Version and commit of this build. Fixed for the life of the process. */
    getRunningVersion(): RunningVersion {
        return this.running;
    }

    getRepo(): string {
        return this.updateCheck.getRepo();
    }

    /** Reads the cached release, refreshing it first when stale. */
    async getInfo(): Promise<ISystemInfo> {
        return this.toInfo(await this.updateCheck.getLatest());
    }

    /** Checks GitHub now, subject to the server-wide cooldown. */
    async checkForUpdates(): Promise<ISystemInfo> {
        return this.toInfo(await this.updateCheck.forceCheck());
    }

    private toInfo({ latest, checkedAt }: UpdateCheckResult): ISystemInfo {
        const latestVersion = latest?.version ?? null;
        return {
            version: this.running.version,
            commit: this.running.commit,
            latest: latestVersion,
            updateAvailable: isUpdateAvailable(this.running.version, latestVersion),
            updateComparable: isComparable(this.running.version),
            checkedAt: checkedAt?.toISOString() ?? null,
            updateCheckEnabled: this.updateCheck.isEnabled(),
            releaseUrl: latest?.url ?? null,
        };
    }
}
