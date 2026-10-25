# Web App

Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). UI rules: [DESIGN.md](DESIGN.md), read before any UI change.

## Conventions

- Build UI from PrimeVue components wherever one fits, even when a design doesn't name them.
- Don't customise PrimeVue components to match a design detail (radius, padding); keep the component's default.
- Tests are Vitest, colocated as `*.test.ts`.
