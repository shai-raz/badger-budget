import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { FxConversionService } from "../transactions/fx-conversion.service";

type CliArgs = {
    batchSize: number;
    maxRetries: number;
    retryDelayMs: number;
    dryRun: boolean;
};

function parseCliArgs(argv: string[]): CliArgs {
    const parsed = new Map<string, string>();

    for (const arg of argv) {
        if (!arg.startsWith("--")) {
            continue;
        }

        const [key, value] = arg.slice(2).split("=");
        parsed.set(key, value ?? "true");
    }

    return {
        batchSize: Number(parsed.get("batch-size") ?? 200),
        maxRetries: Number(parsed.get("max-retries") ?? 3),
        retryDelayMs: Number(parsed.get("retry-delay-ms") ?? 500),
        dryRun: (parsed.get("dry-run") ?? "false") === "true",
    };
}

async function main() {
    const logger = new Logger("FxSnapshotBackfill");
    const args = parseCliArgs(process.argv.slice(2));

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ["error", "warn", "log"],
    });

    try {
        const fxConversionService = app.get(FxConversionService, { strict: false });
        const result = await fxConversionService.backfillMissingSnapshots(args);

        logger.log(
            `Backfill complete (dryRun=${args.dryRun}): batches=${result.batchesProcessed}, processedTransactions=${result.processedTransactions}, snapshotsAttempted=${result.snapshotsAttempted}, snapshotsCreated=${result.snapshotsCreated}, snapshotsFailed=${result.snapshotsFailed}`,
        );
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    const logger = new Logger("FxSnapshotBackfill");
    logger.error(`Backfill failed: ${String(error)}`);
    process.exit(1);
});
