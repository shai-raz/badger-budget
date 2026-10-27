# Design rules (`apps/web`)

Rules and tokens for the web UI. Read before any UI change. How the app is built (stack, state, layout contract, dialog mechanics) lives in [ARCHITECTURE.md](ARCHITECTURE.md).

## Text

- Page title: `text-xl font-semibold` (`components/layout/PageHeader.vue`).
- Section label: the `SharedSectionBand` heading. Mobile `text-xs font-semibold uppercase tracking-wide text-muted-color`; desktop `md:text-base md:font-semibold md:normal-case md:tracking-normal md:text-surface-900`. No other element carries this label style.
- Row title: `text-sm font-semibold` (transactions); `font-semibold` elsewhere.
- Row secondary: `text-[12.5px] text-muted-color` (transactions); `text-xs text-muted-color` elsewhere.
- Amount: `font-semibold tabular-nums`, coloured per [Colour](#colour).
- Meta: `text-xs text-muted-color`.

## Spacing

- Side gutter: `px-4` (16px) inside bands on mobile; desktop bands drop it (`md:px-0`) because the card padding supplies it. The exception is the transaction row, which keeps `px-4` at every breakpoint ([Building blocks](#building-blocks)). Any other band-level message or row that needs a gutter on mobile uses `mx-4 md:mx-0`.
- Band gap: `gap-3` on mobile, `md:gap-6` on desktop. The scroller's `surface-50` shows through the gap.
- Row padding: `py-3`. Transaction rows are `py-2.5` on mobile and `md:py-3`.
- Desktop band padding: `md:p-5`.

## Surfaces

- **Page bands** (the default for every app page): a page sets `definePageMeta({ fullBleed: true })` and wraps its sections in `flex flex-col gap-3 pb-8 md:gap-6`, each section a `SharedSectionBand`. Mobile: full-width, top and bottom border, no side border. Desktop: a card (`md:rounded-xl md:border md:p-5`).
- **Cards** (desktop only, via a band's `md:` chrome): one look everywhere, `bg-surface-0 dark:bg-surface-900`, 1px `border-surface-200 dark:border-surface-700`, no shadow, `rounded-xl` (12px).
- **Always a card** (auth, OAuth consent): PrimeVue `Card`. Its look comes from the `shadow: "none"` token in `app/theme/preset.ts` plus a global `pt.card.root.class` border in `nuxt.config.ts`. Don't restyle `Card` per page; change the global preset or pt instead.
- **Interactive and data widgets** (tables, forms, lists): PrimeVue components.
- **Dialogs**: PrimeVue `Dialog`, fullscreen below `md`. Forms use `SharedFormDialog`. See [Dialogs and forms](#dialogs-and-forms).

## Dialogs and forms

- Title: sentence case, in the page-title colour (global `pt.dialog` in `nuxt.config.ts`). Compact dialogs and ConfirmDialog step down to `text-lg`.
- Close: PrimeVue's plain ✕ (`text rounded secondary`, 40px), with no circle or extra ring.
- Focus: a create form autofocuses its first field. An edit form focuses the dialog itself, so no keyboard opens and no ✕ ring shows, and Tab still reaches the first field.
- Layout: single column, a large amount input first where the form has one (`TransactionForm`, budget form). Mobile: fullscreen below `md`, with Cancel/Save pinned in the footer under the scrolling body.
- Errors: an API error is a `Message` banner above the form, and the dialog stays open. Inline field errors use the `TransactionForm` `labelClass` and `errorClass`.
- Button labels are sentence case: "Save changes", "Delete budget", "Enter sync PIN".
- Entry points open a form dialog in place; they never navigate to a form route.

## Colour

- Primary is a per-scheme token (near-black in light, near-white in dark; Noir-style mapping in `app/theme/preset.ts`). Use `text-primary`, `bg-primary` or PrimeVue severities for it, never a raw `text-primary-<n>` ramp step. Links use `text-primary`.
- Amounts (`components/transactions/formatters.ts`): income `text-teal-500`, expense `text-rose-500`, transfer neutral `text-surface-600 dark:text-surface-300`.
- Budget progress: one bar, fill from `BUDGET_LEVEL_COLOR` in `utils/budget.ts`. Green below 75%, amber from 75% (`warning`), red from 100% (`over`). Spent and used figures take `BUDGET_LEVEL_TEXT_CLASS`. Budget surfaces never use a raw PrimeVue `ProgressBar`.
- Other bars: account credit utilisation uses PrimeVue's default primary bar (6px tall). Reports category bars use the category's own colour.
- Tags (`SharedStatusTag`): tone `neutral` (PrimeVue `secondary`), `success`, `warn`, `danger` or `info`. Values are sentence case.

## Building blocks

Reuse these before drawing your own (`components/shared/` unless noted): `SectionBand` (every page section, with its heading, meta, "see all", loading, error and empty states), `EmptyState`, `EntityAvatar` (sizes from `AVATAR_SIZES`), `IconPicker`, `CategoryChip`, `StatusTag`, `FormDialog`, `BrandLogo`, `transactions/TransactionRow`, `accounts/AccountRow` (mobile) / `dashboard/AccountTile` (desktop), `budgets/BudgetRow`, `BudgetList`, `BudgetProgressBar` and `PeriodStepper`.

- **Period picker** (`SharedPeriodPicker`, with `SharedPeriodPanel`) is the one control for a month range: `‹ label ▾ ›` with presets and a month grid, in a popover from md up and a bottom sheet below md. Below md the labels use short years and there is no "This month" link. A first month click selects that month and keeps the panel open, with a dashed `outline-primary` ring on it and a live hint under the grid (`monthPickHint`); a second month completes the range and closes it, and presets close at once. A completed range draws as one band: solid ends, a `highlight`-tinted middle, and small row caps where it wraps (`monthBandCell`).
- **Transaction row** (`TransactionRow`) owns its `px-4` gutter at every breakpoint, the one exception to [Spacing](#spacing); callers add no horizontal padding.
- `BrandLogo` renders both the `-light` and `-dark` logo sets and lets `.dark` pick one; never place one set alone.
- `CategoryChip` with `showIcon` false shows a colour dot instead of the icon; use it beside an `EntityAvatar` of the same category so the icon isn't shown twice.
- `IconPicker` only picks registry names, never free text.
- Avatars use Lucide icons through `utils/avatarIcons.ts`. Other UI uses PrimeIcons.
- The update badge (hamburger mark, below md) keeps one 0.625rem box in every state, so the header never shifts: a `bg-primary` dot, a spinner while upgrading, an amber dot when stalled. The nav item's label and icon come from `updateNavItem` (`utils/upgradeTracking.ts`).
- Period labels come from `budgetWindowLabel` (`utils/budget.ts`) for budget windows and `selectionLabel` (`utils/monthRange.ts`) for month ranges, never from `Date` formatting in a component.
- Settings links to its sub-pages with chevron rows in a divided band, not primary buttons.

## Rules

- No PrimeFlex classes. `layouts/designContract.test.ts` fails on them.
- Tailwind for layout and look. No per-page restyling of a shared look and no scoped CSS for one.
- Colours come from PrimeVue theme tokens and Tailwind semantic classes, with `dark:` variants, not hardcoded colours in components. Named exceptions are the constants above.
- Muted text is `text-muted-color` (PrimeVue semantic: surface-500 light, surface-400 dark). Never a bare `text-surface-500` or `text-surface-600` text colour without a `dark:` partner (contract test).
- Use an existing building block before making a new one. Keep one component per concept and vary it with props.
- Row actions are an always-visible ⋮ menu, never hover-only actions.
- Tables are for md and up only. Below md, the same data is a divided row list, with no sideways scroll.
