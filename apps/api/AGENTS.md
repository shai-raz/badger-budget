# apps/api

## Development

- When working locally on the apps/api app, if you're on a worktree, copy the `.env ` from the main worktree.

## Conventions

- Services always go through Prisma; no raw SQL (unless absolutely needed).
- DTOs live alongside their feature module and use `class-validator` decorators.

## Testing

**Any new feature (new service method, new endpoint, new non-trivial logic) needs a unit test added alongside it.** There's no e2e suite here — Jest unit tests are the only safety net.

How to add one:

- Test files are colocated with the code they cover: `feature.service.spec.ts` next to `feature.service.ts` (see existing examples like `src/accounts/accounts.service.spec.ts` or `src/budgets/budgets.service.spec.ts`).
- Use `@nestjs/testing`'s `Test.createTestingModule` to build the service under test, and mock `PrismaService` with a plain object of `jest.fn()`s for whichever Prisma models the test touches — don't hit a real database.
- Cover the actual new behavior: the happy path plus whatever edge case motivated the feature (validation failure, not-found, permission/ownership check, etc.), not just an "should be defined" smoke test.

How to verify:

- Run the whole suite: `pnpm test` (from `apps/api`, or `pnpm --filter api test` from the repo root).
- Run a single file while iterating: `pnpm test -- <filename-or-pattern>`, e.g. `pnpm test -- accounts.service.spec.ts`.
- `pnpm test:watch` for watch mode, `pnpm test:cov` for coverage output.
- A feature isn't done until `pnpm test` passes clean — don't leave failing or skipped (`.skip`) tests behind.
