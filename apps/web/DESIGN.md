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
- **Transaction detail** (`pages/transactions/[id].vue`): Overview full width, then a `md:grid-cols-[1.55fr_1fr]` grid. The left column stacks Details and the Reimbursements / Pays back band; the right holds Attachments, `md:sticky md:top-4` so it stays in view beside a long left column. Below md the DOM order is the stacking order. The band ends in a right-aligned receipt (plain lines, divider, emphasised total) whose amounts align with the item amounts via a shared `w-10` action column.
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
- Form dialogs reachable from several pages are mounted once in `layouts/app.vue` and opened through a composable (`useBudgetFormDialog`), so no page or row carries its own copy. Entry points open the dialog in place; they never navigate to a form route.
- Every form dialog is built on `SharedFormDialog`, which requires an `initialFocus` (`field` or `dialog`) so each caller decides where focus starts.

## Colour

- Primary is a per-scheme token (near-black in light, near-white in dark; Noir-style mapping in `app/theme/preset.ts`). Use `text-primary`, `bg-primary` or PrimeVue severities for it, never a raw `text-primary-<n>` ramp step. Links use `text-primary`.
- Amounts (`components/transactions/formatters.ts`): income `text-teal-500`, expense `text-rose-500`, transfer neutral `text-surface-600 dark:text-surface-300`.
- Budget progress: one bar, fill from `BUDGET_LEVEL_COLOR` in `utils/budget.ts`. Green below 75%, amber from 75% (`warning`), red from 100% (`over`). Spent and used figures take `BUDGET_LEVEL_TEXT_CLASS`. Budget surfaces never use a raw PrimeVue `ProgressBar`.
- Other bars: account credit utilisation uses PrimeVue's default primary bar (6px tall). Reports category bars use the category's own colour.
- Tags (`SharedStatusTag`): tone `neutral` (PrimeVue `secondary`), `success`, `warn`, `danger` or `info`. Values are sentence case.

## Building blocks

- **Brand logo** (`components/shared/BrandLogo.vue`): `horizontal` in the sidebar and drawer header, `stacked` on the auth and consent pages; sized by a height class. The `-light` files in `public/brand/` only work on light surfaces and the `-dark` ones only on dark, so the component renders both and `.dark` picks one. Never place one set alone.
- **Section band** (`components/shared/SectionBand.vue`): every page section. Its heading, meta and "see all" link, and its loading, error and empty states; a section passes those props instead of drawing its own.
- **Empty state** (`components/shared/EmptyState.vue`): the one empty state for a list or section, directly or through a band's `empty` slot.
- **Entity avatar** (`components/shared/EntityAvatar.vue`): a category or account icon in its colour, with a `fallback` icon for a missing one.
- **Category chip** (`components/shared/CategoryChip.vue`): a category name inline, such as on transaction detail.
- **Status tag** (`components/shared/StatusTag.vue`): a short label, such as System or Custom, Active or Paused, or a transaction type.
- **Form dialog shell** (`components/shared/FormDialog.vue`): the shell every form dialog is built on. See [Dialogs and forms](#dialogs-and-forms).
- **Transaction row** (`components/transactions/TransactionRow.vue`): one transaction in every transaction list (Transactions, Overview Recent, Budget detail). It owns its `px-4` gutter at every breakpoint, the one exception to [Spacing](#spacing), so callers add no horizontal padding.
- **Account row, mobile** (`components/accounts/AccountRow.vue`): one account below md, on Overview and the Accounts page.
- **Account tile, desktop** (`components/dashboard/AccountTile.vue`): one account at md and up, on Overview and the Accounts page.
- **Budget row** (`components/budgets/BudgetRow.vue`): one budget in a budget list, on Overview and the Budgets page.
- **Budget list** (`components/budgets/BudgetList.vue`): the list of budget rows, shared by Overview and the Budgets page.
- **Progress bar** (`components/budgets/BudgetProgressBar.vue`): a budget's spend, coloured by level. The only budget bar.
- **Period stepper** (`components/budgets/PeriodStepper.vue`): moves a budget list between periods. See [Period stepper](#period-stepper).

Avatars use Lucide icons through `utils/avatarIcons.ts`. Other UI uses PrimeIcons.

## Notes

### Period stepper

- The band label carries the window (`MONTHLY · OCT 2026`); the controls sit on the right.
- "This month" (or the period's equivalent) appears only when off the current window, as a link before the arrows. Next is disabled at the current window.
- Targets are 36px (`h-9 w-9`). No per-row period tag: the band's title already names the period.
- While the next window loads, the body fades (`refreshing`); the stepper does not show a spinner.
- The label comes from `budgetWindowLabel` (`utils/budget.ts`), never from `Date` formatting in the component.

### Settings rows

- Settings navigates to sub-pages with chevron rows (icon, bold name, grey caption, `pi-chevron-right`) in a divided band, not with primary buttons.

## Rules

- No PrimeFlex classes. `layouts/designContract.test.ts` fails on them.
- Tailwind for layout and look. No per-page restyling of a shared look and no scoped CSS for one.
- Colours come from PrimeVue theme tokens and Tailwind semantic classes, with `dark:` variants, not hardcoded colours in components. Named exceptions are the constants above.
- Muted text is `text-muted-color` (PrimeVue semantic: surface-500 light, surface-400 dark). Never a bare `text-surface-500` or `text-surface-600` text colour without a `dark:` partner (contract test).
- Use an existing building block before making a new one. Keep one component per concept and vary it with props.
- Row actions are an always-visible ⋮ menu, never hover-only actions.
- Tables are for md and up only. Below md, the same data is a divided row list, with no sideways scroll.
