# bank-sync

Scrapes Israeli banks with `israeli-bank-scrapers` (IBS) + `puppeteer-extra` (stealth). Overview in `apps/api/ARCHITECTURE.md`.

- Credentials are encrypted with the user's sync **PIN** (see `crypto/AGENTS.md`); no connection can be created before a PIN is set. Changing the PIN re-encrypts the verifier and deletes `SyncPasskey` rows, but not stored connection credentials.
- An `AutoSyncCredential` row must be deleted wherever a connection's credentials change or it is deleted (soft delete: the cascade won't fire). A PIN change deletes the auto-sync grant with the passkeys.
- `SyncPasskey` rows hold only a browser-wrapped PIN; there is no server-side WebAuthn. Registration needs `verifyPin` and is capped at `MAX_PASSKEYS`.
- `POST bank-sync/auto-sync/run` is public and throttled, with one uniform 401. It checks the device key before consuming the run token. K, PIN and token never reach logs or errors.
- Scraped rows go through `transactions/transaction-import.service.ts`, never straight to `Transaction`.
- Without `BROWSERLESS_URL`, `scrapeConnection` launches Chromium itself through `puppeteer-extra` and hands it to IBS (IBS alone would launch plain puppeteer, without stealth). `BANK_SYNC_CONCURRENCY` caps sessions.
- `CAL_PROXY_URL` runs `visaCal` in its own proxied browser context (Cal blocks datacenter IPs), with one direct retry unless the error is a credential error (never retried, to avoid lockouts).
- IBS is installed from the shai-raz fork, pinned to a commit, for in-browser Cal API calls.
- Debug artifacts (screenshots, MHTML) are bank-page content: upload to R2 when configured, write locally only with `STORE_SCRAPER_DEBUG_LOCALLY=true`, otherwise store nothing.
- Every failure path must set `errorCode` (`withSyncErrorCode` / `syncErrorCodeOf`); the web copy map is total over `SYNC_ERROR_CODES`.
- `SyncRecoveryService` marks every pending/running run interrupted on boot, which assumes one API instance.

## Balances

- Balances come off the scraped accounts (`scraped-balance.util.ts`), not from summing transactions, and are saved by `AccountBalanceService` in their own try/catch so a balance failure never fails the sync. The account-type sweep (`upgradeUnknownAccountTypes`) runs outside that try/catch with its own.
- **`balance` means different things per provider**: money in the account (banks), next charge (`visaCal`), or consumed credit (`max`, `isracard`, `amex`). `BALANCE_KIND_BY_COMPANY` (`@badger/shared-data`) is a total map, so a new provider won't compile until its kind is declared. Never sum across kinds, and never sum `cardFrame` across accounts.

## Dates

IBS sets `moment.tz.setDefault('Asia/Jerusalem')` globally on first scrape, which leaks into every later `moment()` in the process. Scraped dates are converted to UTC midnight of the provider's local day (`scraped-date.util.ts`, zone from `SOURCE_TIMEZONE_BY_COMPANY`). Never pass `new Date(txn.date)` to a `@db.Date` column.
