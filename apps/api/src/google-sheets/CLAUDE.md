# google-sheets

Alternate/legacy transaction import source: reads rows from a user-connected Google Sheet (via a shared service-account key, not per-user OAuth) and feeds them through the same import pipeline as `bank-sync`.

- Uses `@googleapis/sheets` plus `google-auth-library` rather than the full `googleapis` bundle (about 195 MB, dropped to keep the Docker image small).
- Auth is a single service account, configured only through the `GOOGLE_SHEETS_*` env vars (the key file's fields, copied as-is; no key file is read), scoped read-only to spreadsheets — not the user's own Google identity. The feature is off (and its UI hidden) unless `GOOGLE_SHEETS_CLIENT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY` are set.
- `SheetRow` has several fields the sync explicitly ignores (`hash`, `originalAmount`, `status` — see comments in `google-sheets.service.ts`); don't assume every column is used.
- Rows are handed to `transactions/transaction-import.service.ts` (same shared path bank-sync uses), and category resolution falls back to `category-mapping-rules`' `findMatchingCategoryId` when the sheet's own category doesn't map cleanly — see `category-resolution.ts`.
- `POST /google-sheets/backfill-currencies` (`backfillCurrenciesOnce`) is a one-time-per-user migration: re-reads the sheet to recover `originalAmount`/`originalCurrency` on historical transactions and sets each account's currency, then stamps `User.currencyBackfilledAt` so it no-ops on repeat calls. Not related to `scripts/fx:backfill-conversions` (see `scripts/CLAUDE.md`), which backfills FX rate snapshots instead — different tables, different purpose.
- This predates `bank-sync` and is the older of the two import mechanisms — expect some overlap/duplication in intent, not a clean layering.
