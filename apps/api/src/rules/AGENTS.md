# rules

Conditions and actions, matched in priority order against the user's transactions. Vocabulary is in `@badger/shared-data`, matching and formatting in `@badger/utils`; this module stores, validates and runs them.

- **Soft delete.** Rules are soft-deleted (`deletedAt`); their condition and action rows are replaced or deleted outright. Every query, the matcher input, counts, reorder and cleanup filter on `deletedAt: null`.
- **Priority only orders.** Create appends after the last live rule. Soft delete leaves gaps. Reorder rewrites every live rule to 1..n from the full id set, and a stale or partial set gets 409.
- **Matching.** The last matching `set_category` wins; a matched rule with `stopOnMatch` ends the run. Use `runRules` from `@badger/utils`; don't reimplement matching here or in the web.
- **Candidates.** Mirror rows of linked transfers (`counterpartOfId`) are never candidates, so preview and apply skip them. Preview and apply load every candidate into memory: fine at current scale, revisit if it grows.
- **Save and apply** is one interactive transaction with a 60s timeout (Prisma's default is 5s).
- **No foreign keys on values.** An `account` condition value and a `set_category` action value are plain strings. Any path that deletes or merges a referenced account or category must call `rule-cleanup.ts` inside its own transaction, or rules keep pointing at nothing.
- **Stored rows.** `rule-mapping.ts` drops stored conditions or actions whose field, operator or type is no longer valid instead of casting them. Writes are checked by `assertValidDraft` in `rules.service.ts`.
