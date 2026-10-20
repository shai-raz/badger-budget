# category-mapping-rules

User-defined rules that auto-assign a category to imported/created transactions based on description, original (bank/sheet) category, or amount.

- Rules are ordered by `priority` (auto-incremented on create — new rules go last) with `stopOnMatch` controlling whether later rules still run. The actual matching predicate lives in `@badger/utils` (`findMatchingCategoryId`), shared so other modules (e.g. import pipelines) can reuse it — don't reimplement matching logic locally.
- "Delete" (`remove`) just flips `isActive: false`; this table has no `deletedAt`, so all queries filter on `isActive` instead.
- `applyRuleToAllTransactions` loads _all_ of the user's transactions into memory to test the rule client-side rather than translating the rule into a Prisma `where` — fine at current scale, but don't assume it's indexed/streamed if performance ever comes up.
