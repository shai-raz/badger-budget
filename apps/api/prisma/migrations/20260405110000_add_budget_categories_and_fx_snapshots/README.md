# Release runbook: budget category join-table + FX snapshot backfill

This runbook covers release operations for migration `20260405110000_add_budget_categories_and_fx_snapshots`.

## Scope

- Introduces additive tables: `budget_categories`, `transaction_conversions`, and `fx_rates_daily`.
- Backfills `budget_categories` from legacy `budgets.category_id` during migration.
- Requires a post-migration backfill job to populate missing `transaction_conversions` rows.

## Cutover switch (feature-flag equivalent)

There is no dedicated runtime env flag in the API for this migration. The cutover switch is operational and has two levers:

1. **Write contract switch (client/API behavior):**
   - **Legacy mode:** clients continue sending `categoryId` only.
   - **Dual-write mode (recommended during rollout):** clients send `categoryIds[]`; API still keeps `categoryId` populated for compatibility.
2. **Traffic switch (deployment behavior):**
   - Gradually move traffic to the new deployment (canary/rolling).

**Cutover decision rule:** stay in dual-write mode until post-release verification shows healthy parity metrics (defined below), then declare full cutover.

## Migration order + backfill order

Always run in this order:

1. **Deploy API build that is compatible with both legacy + new schema behavior.**
2. **Apply migration** `20260405110000_add_budget_categories_and_fx_snapshots`.
3. **Run FX snapshot backfill** (`fx:backfill-conversions`) until complete.
4. **Run idempotency verification pass** of backfill (`snapshotsCreated` should be `0`).
5. **Enable/expand production traffic** only after go/no-go checks pass.

---

## Staging runbook

### 1) Pre-flight checks

From `apps/api`:

```bash
pnpm prisma:generate
pnpm check-types
pnpm test
```

Database sanity checks (staging DB):

```sql
-- Expect 0 rows before migration
SELECT to_regclass('public.budget_categories');
SELECT to_regclass('public.transaction_conversions');
SELECT to_regclass('public.fx_rates_daily');
```

### 2) Deploy + migrate

Apply migration via your standard deployment workflow (CI/CD or Prisma migration command used by your environment).

Post-migration schema checks:

```sql
SELECT to_regclass('public.budget_categories')       AS budget_categories,
       to_regclass('public.transaction_conversions') AS transaction_conversions,
       to_regclass('public.fx_rates_daily')          AS fx_rates_daily;
```

### 3) Backfill in staging

Dry run:

```bash
pnpm fx:backfill-conversions --dry-run=true --batch-size=200
```

Real run:

```bash
pnpm fx:backfill-conversions --batch-size=200 --max-retries=4 --retry-delay-ms=750
```

Idempotency verification run:

```bash
pnpm fx:backfill-conversions --batch-size=200 --max-retries=4 --retry-delay-ms=750
```

Expected idempotency result: `snapshotsCreated=0` and stable/near-zero `snapshotsFailed`.

### 4) Staging verification checklist (go/no-go)

**Go only if all are true:**

1. Migration tables exist and are queryable.
2. API endpoints for budgets and transactions return 2xx at expected baseline rates.
3. Backfill completed with:
   - `snapshotsFailed = 0` (or only known/transient failures with remediation complete), and
   - idempotency pass reports `snapshotsCreated = 0`.
4. Budget-category parity check passes:

```sql
-- Budgets where legacy category exists but join-table mapping is missing (must be 0)
SELECT COUNT(*) AS missing_budget_category_links
FROM budgets b
WHERE b.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM budget_categories bc
    WHERE bc.budget_id = b.id
      AND bc.category_id = b.category_id
  );
```

5. Conversion coverage check for historical expense transactions is acceptable for your staging dataset:

```sql
-- Expense tx with no conversion row after backfill (track and investigate if unexpectedly high)
SELECT COUNT(*) AS expense_tx_without_conversion
FROM transactions t
WHERE t.type = 'expense'
  AND NOT EXISTS (
    SELECT 1
    FROM transaction_conversions tc
    WHERE tc.transaction_id = t.id
  );
```

---

## Production runbook

### 0) Release gate

- Confirm staging runbook completed successfully for the same release artifact.
- Confirm `FREE_CURRENCY_API_KEY` is present in production runtime env.
- Confirm on-call + rollback owner are assigned.

### 1) Controlled rollout

1. Deploy API artifact in **dual-write mode** (accept/use `categoryIds[]`, keep legacy compatibility).
2. Apply migration.
3. Start with partial traffic (canary or a single slice) if your platform supports it.

### 2) Production backfill order

1. Dry run:

```bash
pnpm fx:backfill-conversions --dry-run=true --batch-size=200
```

2. Real run:

```bash
pnpm fx:backfill-conversions --batch-size=200 --max-retries=4 --retry-delay-ms=750
```

3. Idempotency verification run:

```bash
pnpm fx:backfill-conversions --batch-size=200 --max-retries=4 --retry-delay-ms=750
```

### 3) Post-release verification checklist (production)

Check within the first 15–30 minutes, then again after backfill completion:

- API health/latency/error rates remain within normal release thresholds.
- No sustained increase in 5xx responses from budgets/transactions endpoints.
- Backfill metrics:
  - `snapshotsFailed` does not trend upward.
  - final idempotency rerun yields `snapshotsCreated = 0`.
- Data parity checks:

```sql
SELECT COUNT(*) AS missing_budget_category_links
FROM budgets b
WHERE b.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM budget_categories bc
    WHERE bc.budget_id = b.id
      AND bc.category_id = b.category_id
  );
```

```sql
SELECT COUNT(*) AS expense_tx_without_conversion
FROM transactions t
WHERE t.type = 'expense'
  AND NOT EXISTS (
    SELECT 1
    FROM transaction_conversions tc
    WHERE tc.transaction_id = t.id
  );
```

### 4) Go / no-go metrics after deploy

Declare **GO** when all are met:

- Endpoint error budget is healthy (no sustained regression vs pre-deploy baseline).
- `missing_budget_category_links = 0`.
- Backfill completed and idempotency rerun reports `snapshotsCreated = 0`.
- `expense_tx_without_conversion` is at expected residual level for excluded/non-convertible data (or zero).

Declare **NO-GO** if any occur:

- sustained 5xx or latency regression,
- rising `snapshotsFailed` without recovery,
- parity query shows non-zero missing budget/category links,
- inability to complete backfill within release window.

---

## Rollback plan

Because the migration is additive, rollback is primarily **application-level**:

1. **Traffic rollback:** shift traffic back to prior stable API deployment.
2. **Behavior rollback:** keep clients in legacy `categoryId` behavior.
3. **Stop backfill job** if it is causing operational pressure.
4. **Do not drop new tables during incident response**; preserve data for recovery.
5. After stabilization, perform incident review and decide whether to:
   - re-attempt backfill with smaller `--batch-size`,
   - increase retries/backoff,
   - or schedule a new release window.

## Why backfill is safe to rerun

- The backfill only targets missing `(transaction_id, target_currency_id)` combinations.
- Snapshot writes use Prisma `upsert`, so existing rows are not duplicated.
- If interrupted, rerun with the same command; it resumes safely.

## Operational notes

- `FREE_CURRENCY_API_KEY` is required for uncached rates.
- Existing `fx_rates_daily` cache entries are reused automatically.
- Lower `--batch-size` if DB pressure or lock contention is observed.
