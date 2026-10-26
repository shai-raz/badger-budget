# demo

Generates the demo account's transactions and balance tiles. Used by `prisma/seed-demo.ts` (initial seed, only with `SEED_DEMO=true`) and by `DemoService.topUpIfStale`, which `AuthService.login` calls after a successful password login for `DEMO_EMAIL`. No controller, no cron, and refresh-token logins don't top up.

- A top-up failure is logged, never thrown: it must not fail the login. Balance refresh and the ATM backfill each have their own try/catch, separate from the transaction top-up.
- The demo login is public, so concurrent logins are expected. Every write path is guarded: `users.demo_data_through` is a watermark advanced by a conditional `updateMany` in the same transaction as the generation (a racing login gets `count === 0` and backs off), and balance-account creation locks the user row first. Keep these guards when changing the flow; the reasoning is commented in `demo.service.ts`.
- Probes for "already generated" rows ignore `deletedAt` on purpose: visitors can soft-delete demo rows, and those must not be regenerated.
- The rolling-window trim and the one-time reseed hard-delete: the sanctioned exception to soft-delete, since the data is regenerable.
- Dates are UTC-midnight date-only values from `toDateOnly` (`@db.Date`); never pass a timestamp with a time part.
- Generation must stay deterministic where top-ups could overlap (salary day, ATM day and amount per month), so disjoint windows never double a month. Only `seed-demo.ts` seeds faker; top-ups are unseeded.
- `seed-demo.ts` imports this folder by relative path and can't resolve `@badger/shared-data`, so shared constants are inlined here (`CASH_WITHDRAWAL_LABEL` in `demo-data.constants.ts`, icon names). Keep them in sync; `demo-icons.spec.ts` checks icons against `AVATAR_ICON_NAMES`.
- Balance tiles write the same `accounts.balance*` / `cardFrame` columns a real scrape does (`accounts/AGENTS.md`), refreshed on every top-up, not just when the watermark moves.
