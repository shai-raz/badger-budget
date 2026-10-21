# cash-withdrawal-patterns

Patterns that identify a transaction as an ATM cash withdrawal, so the web edit modal can hint "Looks like a cash withdrawal" and prefill the transfer to a cash wallet.

- Read-only in v1: `GET /cash-withdrawal-patterns` returns system rows plus the caller's own (system first, then oldest first). No create/delete endpoints and no management UI yet.
- System rows are seeded (`prisma/seed.ts`), `userId = null`, `isSystem = true`. User rows (`userId` set) are reserved for future use.
- Matching is client-side: a pattern matches when the transaction's `matchField` (`description` | `additionalDescription`) contains `text`. The API only serves the list.
- The seeded row matches `additionalDescription` containing `CASH_WITHDRAWAL_LABEL` ("משיכת מזומן", `@badger/shared-data`), Cal's label for card cash withdrawals. It is the full phrase on purpose: the shorter "משיכ" also matches cheque and Bit/PayBox rows. Keep the seed literal in sync with the constant.
