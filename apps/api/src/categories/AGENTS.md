# categories

Expense/income categories. The model supports `isSystem: true` categories (shared, read-only), but none are seeded today. Per-user categories (`userId` set, full CRUD) are the ones in use.

## Icons

- `icon` is a name from `AVATAR_ICON_NAMES` (`@badger/shared-data`) or null. The DTOs enforce this with `@IsIn`; legacy values are never re-validated unless `icon` is sent on an update.
- Create with `icon` omitted stores `defaultCategoryIcon(name)`; an explicit `null` stores no icon. Bank import uses the same default.
- `CategoryIconBackfillService` re-icons legacy categories once, on boot, under the `category-icons-v1` marker (see "One-shot data backfills" in `apps/api/ARCHITECTURE.md`). Because the marker is claimed once, an icon a user later sets to `tag` is never touched.

- `findAll`/`findOne` return system categories _and_ the caller's own — don't forget the `OR: [{ isSystem: true }, { userId }]` shape when querying elsewhere.
- `DELETE /categories/:id` takes an optional body (`transferToCategoryId`, `moveMappingRules`), all inside one `$transaction`:
    - **Leave uncategorized** (no target): transactions and the scalar budget `categoryId` are nulled; budget join rows (`budgetCategory`) and mapping rules are **deleted** — they can't survive a dead category, and since soft-delete means the DB's `onDelete: Cascade` never fires, leaving them around would orphan them.
    - **Move** (target given): transactions, the scalar budget link, join rows, and (by default, unless `moveMappingRules: false`) mapping rules are all re-pointed to the target instead. Join rows for budgets already linked to the target are deleted first to dodge the `(budgetId, categoryId)` PK collision; mapping rules that would duplicate one already on the target (same field/operator/value — there's no unique constraint) are dropped before re-pointing the rest.
- Category names must be unique per user (checked on create and update).
