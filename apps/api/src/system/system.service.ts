import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IChangelogResponse, IChangelogSeenResponse, ISystemInfo } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { buildChangelogResponse, nextSeenVersion } from "./changelog";
import { ChangelogService } from "./changelog.service";
import { RunningVersion, readApiPackageVersion, resolveRunningVersion } from "./running-version";
import { UpdateCheckResult, UpdateCheckService } from "./update-check.service";
import { baseVersion, isComparable, isUpdateAvailable } from "./version";

@Injectable()
export class SystemService {
    private readonly running: RunningVersion;

    constructor(
        config: ConfigService,
        private readonly updateCheck: UpdateCheckService,
        private readonly changelog: ChangelogService,
        private readonly prisma: PrismaService,
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

    /** Release notes up to the running build, with the user's What's New stamp. */
    async getChangelog(userId: string): Promise<IChangelogResponse> {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { lastSeenVersion: true } });
        return buildChangelogResponse({
            releases: this.changelog.getReleases(),
            currentVersion: baseVersion(this.running.version),
            lastSeenVersion: user?.lastSeenVersion ?? null,
            repo: this.getRepo(),
        });
    }

    /** Records that the user has seen What's New for the running build. Never lowers the stored version. */
    async markChangelogSeen(userId: string): Promise<IChangelogSeenResponse> {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { lastSeenVersion: true } });
        const stored = user?.lastSeenVersion ?? null;
        const next = nextSeenVersion(baseVersion(this.running.version), stored);
        if (next !== stored) {
            await this.prisma.user.update({ where: { id: userId }, data: { lastSeenVersion: next } });
        }
        return { lastSeenVersion: next };
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
