# scripts

One-off CLI scripts run via `NestFactory.createApplicationContext`, not part of the running API.

- `backfill-missing-conversions.ts` (`pnpm fx:backfill-conversions`): fills in missing `TransactionConversion` FX snapshots for existing transactions, in batches, with retry/dry-run flags (`--batch-size`, `--max-retries`, `--retry-delay-ms`, `--dry-run`). Needed because FX snapshotting was added after transactions already existed — new transactions snapshot their conversion at creation time via `transactions/fx-conversion.service.ts` and shouldn't need this. Unrelated to `User.currencyBackfilledAt` (see `google-sheets/CLAUDE.md`) — that's a different, sheet-specific backfill.
- Not covered by the Nest DI graph used by the running server — if you add a script here, bootstrap it the same way (`NestFactory.createApplicationContext(AppModule)`) rather than duplicating service logic.
