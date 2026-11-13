---
name: israeli-bank-scrapers-bump
description: Checks to run when changing the pinned israeli-bank-scrapers (IBS) commit in apps/api/package.json. Use when upgrading, re-pinning or rebasing the shai-raz/israeli-bank-scrapers fork, or when reviewing a PR that does.
---

# Bumping israeli-bank-scrapers

`apps/api/package.json` pins `israeli-bank-scrapers` to a commit of the `shai-raz/israeli-bank-scrapers` fork. Bank sync stores two values that come straight from IBS and that the importer matches on later. A bump that changes how either is produced corrupts existing users' data without any error, and upstream does not mark such changes as breaking (they ship as `fix`).

## Before changing the pin

Diff the scrapers between the old and the new commit, in a clone of the fork:

```bash
git diff <old-sha>..<new-sha> -- src/scrapers | grep -nE "accountNumber|identifier"
```

Read every hit for a provider in `SOURCE_TIMEZONE_BY_COMPANY` (`packages/shared-data`), then check the two rules below.

### 1. The account number format must not change

The importer finds an account by the exact `accountNumber` string IBS returns (`transactions/transaction-import.service.ts`), and it never matches a transaction across two live accounts (`transactions/import-dedup.ts`). If a provider's string changes in any way (a prefix, a separator, padding, a different source field), the next sync creates a second account and imports the whole sync window into it again as duplicates.

If the format changes: don't ship the bump as is. Either keep the old format in the fork, or ship a data migration that rewrites `accounts.account_number` for that provider in the same release.

### 2. The transaction identifier format must not change

`txn.identifier` is stored as `Transaction.externalId` and is the main key for recognising a transaction that is already imported. If a provider's identifier changes (a suffix added, a different field), stored rows stop matching by id. The importer then falls back to a look-alike match (same account, day, amount and description), which catches most rows but not ones whose amount or description also differ.

If the format changes: say so in the PR, and test a sync against a database that already holds that provider's rows. A second sync must insert nothing.

## After changing the pin

- Run one real sync per provider you can reach, twice. The second run must insert 0 transactions.
- `pnpm test` in `apps/api` (`ibs-date-timezone.spec.ts` guards the date handling IBS sets up globally).

## What this does not cover

A bank can change the account number it shows on its own site with no IBS change (Mizrahi's is read from the page). No upgrade check catches that.
