# categories

Expense/income categories. The model supports `isSystem: true` categories (shared, read-only), but none are seeded today. Per-user categories (`userId` set, full CRUD) are the ones in use.

## Icons

- `icon` is a name from `AVATAR_ICON_NAMES` (`@badger/shared-data`) or null. The DTOs enforce this with `@IsIn`; legacy values are never re-validated unless `icon` is sent on an update.
- Create with `icon` omitted stores `defaultCategoryIcon(name)`; an explicit `null` stores no icon. Bank import uses the same default.
- `CategoryIconBackfillService` re-icons legacy categories once, on boot, under the `category-icons-v1` marker (see "One-shot data backfills" in `apps/api/ARCHITECTURE.md`). Because the marker is claimed once, an icon a user later sets to `tag` is never touched.

- `findAll`/`findOne` return system categories _and_ the caller's own — don't forget the `OR: [{ isSystem: true }, { userId }]` shape when querying elsewhere.
- `DELETE /categories/:id` takes an optional body (`transferToCategoryId`, `moveRules`), all inside one `$transaction`:
    - **Leave uncategorized** (no target): transactions and the scalar budget `categoryId` are nulled; budget join rows (`budgetCategory`) are **deleted**; rules that set this category are **soft-deleted**, since soft delete never fires the DB's `onDelete: Cascade`.
    - **Move** (target given): transactions, the scalar budget link and join rows are re-pointed to the target. Join rows for budgets already linked to the target are deleted first, to dodge the `(budgetId, categoryId)` PK collision. Rules are re-pointed unless `moveRules: false`, which soft-deletes them; a rule whose conditions and actions match one already on the target is soft-deleted rather than moved. See `rules/rule-cleanup.ts`.
- Category names must be unique per user (checked on create and update).
