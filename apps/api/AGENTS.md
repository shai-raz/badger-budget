# apps/api

Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

- In a git worktree, copy `apps/api/.env` from the main worktree.
- Go through Prisma; raw SQL only when unavoidable.
- DTOs live in their feature module and use `class-validator`.

## Testing

Jest unit tests are the only safety net (no e2e suite), so every new service method, endpoint or non-trivial logic gets a spec.

- Colocate it: `feature.service.spec.ts` next to `feature.service.ts` (e.g. `src/budgets/budgets.service.spec.ts`).
- Build the service with `Test.createTestingModule` and mock `PrismaService` as a plain object of `jest.fn()`s; never hit a real database.
- Cover the new behaviour and the edge case that motivated it (validation, not-found, ownership), not just "should be defined".
- `pnpm test -- <pattern>` from `apps/api` runs one file. Leave no failing or `.skip`ped tests.
