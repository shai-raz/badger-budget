# prisma

Thin wrapper module: `PrismaService` extends `PrismaClient`, hooks `$connect`/`$disconnect` into Nest's module lifecycle, and is injected everywhere instead of instantiating `PrismaClient` directly.

- All other modules depend on this one; there's no per-feature Prisma client.
- Schema, migrations, and seeds live in `apps/api/prisma/` (one level up from this `src/prisma/` module) — `schema.prisma`, `migrations/`, `seed.ts`, `seed-demo.ts`. `seed-demo.ts` itself only wires up the demo user/accounts/categories/budgets; the actual transaction-generation rules live in `src/demo` (shared with the demo-login top-up).
