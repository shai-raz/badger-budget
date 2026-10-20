# Web App

Read @ARCHITECTURE.md for an overview of the web app's architecture.

## Conventions

- PrimeVue is the UI library used here - that means everything that we're doing UI wise should be done with PrimeVue, wherever possible. Even when you're given a design that doesn't explictly use PrimeVue component, figure out which components we need to use from PrimeVue and implement the design using it.
- Try to avoid manual customizations of PrimeVue components as much as possible. For example, if a component by default has a certain border radius, and to change it we need to make config changes, ignore the design if it defers from that value.
- Web composables (`app/composables/`) can be used as TanStack Query calls wrappers; components don't call the API client directly.
- Styling rules (Tailwind over PrimeFlex, surfaces, text, spacing, colour, shared building blocks) are in [DESIGN.md](DESIGN.md); follow them rather than restating them here.
