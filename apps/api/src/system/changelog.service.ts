import { readFileSync } from "fs";
import { resolve } from "path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ChangelogSource, ChangelogSourceRelease, filterUserFacing, parseChangelogSource } from "./changelog";

/** Injection token for the changelog reader. Production reads the bundled file; tests pass fixtures. */
export const CHANGELOG_READER = Symbol("CHANGELOG_READER");
export type ChangelogReader = () => unknown;

/** apps/api/changelog.json, written by the release workflow and copied into the image by the Dockerfile. */
export const BUNDLED_CHANGELOG_PATH = resolve(__dirname, "../../changelog.json");

/** Reads and parses a changelog file. Returns null when it is missing, not JSON or the wrong shape. */
export function readChangelogFile(path: string): unknown {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
        return null;
    }
}

/**
 * Serves the user-facing release history from the bundled changelog. Read once on first use and kept. A missing or
 * invalid file yields no releases and one warning, never an error: What's New is optional and the rest of the API
 * must keep working.
 */
@Injectable()
export class ChangelogService {
    private readonly logger = new Logger(ChangelogService.name);
    private releases: ChangelogSourceRelease[] | null = null;

    constructor(@Inject(CHANGELOG_READER) private readonly read: ChangelogReader) {}

    /** User-facing releases, newest first. Empty when the file is missing or invalid. */
    getReleases(): ChangelogSourceRelease[] {
        this.releases ??= this.load();
        return this.releases;
    }

    private load(): ChangelogSourceRelease[] {
        const source: ChangelogSource | null = parseChangelogSource(this.read());
        if (!source) {
            this.logger.warn("changelog.json is missing or invalid; What's New will show no releases");
            return [];
        }
        return filterUserFacing(source.releases);
    }
}
