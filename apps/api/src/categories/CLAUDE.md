# categories

Expense/income categories. Split between seeded `isSystem: true` categories (shared, read-only) and per-user categories (full CRUD).

- `findAll`/`findOne` return system categories _and_ the caller's own — don't forget the `OR: [{ isSystem: true }, { userId }]` shape when querying elsewhere.
- `DELETE /categories/:id` takes an optional body (`transferToCategoryId`, `moveMappingRules`), all inside one `$transaction`:
    - **Leave uncategorized** (no target): transactions and the scalar budget `categoryId` are nulled; budget join rows (`budgetCategory`) and mapping rules are **deleted** — they can't survive a dead category, and since soft-delete means the DB's `onDelete: Cascade` never fires, leaving them around would orphan them.
    - **Move** (target given): transactions, the scalar budget link, join rows, and (by default, unless `moveMappingRules: false`) mapping rules are all re-pointed to the target instead. Join rows for budgets already linked to the target are deleted first to dodge the `(budgetId, categoryId)` PK collision; mapping rules that would duplicate one already on the target (same field/operator/value — there's no unique constraint) are dropped before re-pointing the rest.
- `GET /:id/usage` (`getUsageCount`) is what the web UI uses to warn "this category is used by N transactions/budgets/mapping rules" before a user deletes it.
- Category names must be unique per user (checked on create and update).
