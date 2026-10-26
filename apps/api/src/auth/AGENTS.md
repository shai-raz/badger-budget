# auth

JWT auth (register/login/refresh/logout) plus Google OAuth (currently unused in the product; the code paths — `google`, `google/callback`, `google/mobile` — are tested and enabled only when Google credentials are configured).

- Access tokens are 15m, refresh tokens are 7d and stored in the `RefreshToken` table; `refreshTokens()` deletes the old row and issues a new pair (rotation, not reuse).
- **Every user-creation path** (`register()`, `exchangeGoogleCode`, `validateGoogleUser`) must, in one `$transaction`:
    - pass the registration gate (`RegistrationPolicyService`): open while no non-demo user exists (soft-deleted users count) or with `ALLOW_REGISTRATION=true`, else 403. Call `lockAndAssert` inside the transaction (a `pg_advisory_xact_lock`, so concurrent first sign-ups serialize); `register()` and `validateGoogleUser` also fail fast with `assertRegistrationOpen()` before it;
    - set `role` from `roleForNewUser(tx, email)`, called after `lockAndAssert`. The first live non-demo user becomes `ADMIN`; the demo account is always `USER`;
    - create the default "Cash" account (`createDefaultCashAccount`): other code assumes every user has at least one account.
- New users get `currencyBackfilledAt` set immediately, marking them as not needing `google-sheets`' one-time legacy currency backfill (see `google-sheets/AGENTS.md`) since they have no pre-existing sheet-imported data to migrate.
- Passwords are bcrypt-hashed (cost 10); Google-only users have no `password` and can't use `/auth/login`.
- `JWT_SECRET` / `JWT_REFRESH_SECRET` are separate secrets — don't reuse one for the other. They come from env or `DATA_DIR/secrets` (generated on first boot, see `config/secrets.ts`); there is no fallback value, so `JwtModule` uses `getOrThrow`.
- Google login exists only when `isGoogleAuthConfigured()` (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` both non-empty). `GoogleStrategy` is a factory provider that is `null` when unconfigured, `GoogleAuthGuard` and `exchangeGoogleCode` throw `NotFoundException` in that case.
- `login()` tops up demo data for `DEMO_EMAIL` via `DemoService.topUpIfStale` after password verification; errors are logged, never thrown — a top-up failure never fails the login. See `demo/AGENTS.md`.
