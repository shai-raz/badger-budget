# Web Architecture (`apps/web`)

Nuxt 4 SPA (`ssr: false`; Vite 8 / Rolldown, Lightning CSS minification). `nuxt` is pinned `~4.5.2` because 4.6.x needs Node ^22.22.3, above `.node-version`; the Docker image pins its own Node (`NODE_VERSION` in the `Dockerfile`).

- **UI**: PrimeVue 4 (Aura with a custom near-black primary ramp, `app/theme/preset.ts`) + Tailwind CSS 3 + PrimeIcons. Visual rules: [DESIGN.md](DESIGN.md).
- **State**: Pinia (`app/stores/`) for client state, TanStack Query (`@peterbud/nuxt-query`) for server state. Components call composables, never the API client directly. A page's month range lives in the URL, not Pinia: `useMonthRangeQuery` reads and writes `?from=YYYY-MM&to=YYYY-MM` (`?from=all` for all time). The transactions list's other filters live there too (`utils/transactionFilterQuery.ts`).
- **API base URL** is the same-origin `/api/v1`. `NUXT_PUBLIC_API_BASE_URL` overrides it at build time only. In `pnpm dev:web`, `nitro.devProxy` forwards `/api` and `/.well-known` to port 3000.
- **Instance flags**: `useInstanceConfig()` wraps the public `GET /config`. Gate UI through the helpers in `utils/appConfig.ts`; unknown (loading or failed) config hides or skips, never guesses.
- **Bank sync**: `useBankSyncFlow()` is provided by the `app` layout, so sync controls only work inside it. The passkey unlock (`useSyncUnlock`, `utils/syncPasskey*`) never persists the PIN client-side.
- **PWA**: `@vite-pwa/nuxt`. `/api`, `/.well-known` and `/oauth` are excluded from the SPA navigation fallback; keep them out. Not loaded under vitest (`nuxt.config.ts`), since its client plugin imports a virtual module the test env cannot resolve.
- **Tests**: Vitest has two projects. `unit` is node (`*.test.ts`); pure logic belongs in `utils/` with node tests. `nuxt` mounts real components (`*.nuxt.test.ts`, `mountSuspended`) on happy-dom.
- **Pages** mirror API resources. `pages/auth/` and `pages/oauth/` are standalone (no layout).

## CSS layer order

PrimeVue injects its CSS at runtime, which lands after the bundled Tailwind CSS in production but before it in dev, so equal-specificity rules would win differently in each. `app/assets/css/tailwind.css` pins the order, and the PrimeVue `cssLayer` option in `nuxt.config.ts` puts its CSS in the middle layer:

```
tailwind-base  <  primevue  <  tailwind-utilities
```

- Both halves are required; changing one without the other reintroduces the dev/prod mismatch.
- In dev, Tailwind emits `dark:` variants outside the layers (prod keeps them inside), so a layered `!important` base class beats `dark:!…` there. Keep `!` off any property a `dark:` variant changes.
- Tailwind utilities (including global `pt` classes) override PrimeVue styles. Unlayered CSS beats all layers, so SFC `<style>` blocks win over utilities: keep them on bespoke class names.
- Verify changes here with a production build (`pnpm build`, then `node .output/server/index.mjs`); dev and prod can disagree (see the `dark:` note above), so check both. Lightning CSS drops the `@layer a, b, c;` statement and keeps first-appearance order, which still gives the same result; if a prod-only mismatch appears, check the built CSS before renaming layers.

## Theme

- `.dark` on `<html>` is PrimeVue's `darkModeSelector`; `stores/theme.ts` owns it. With no saved `theme-preference` the theme follows the OS live.
- `THEME_INIT_SCRIPT` (`utils/theme.ts`), injected via `app.head`, applies the theme before first paint.
- The `theme-color` meta follows the theme (`plugins/theme.client.ts`). iOS standalone ignores it, so `apple-mobile-web-app-status-bar-style` stays at its default: no static value is right in both themes.

## Breakpoints

`md` (768px) is the mobile/desktop divide. Templates use `md:`; script uses `useIsDesktop()` (VueUse `breakpointsTailwind`), never a literal. `BELOW_MD` (`utils/breakpoints.ts`) is the same divide as a media-query string for props like PrimeVue's `breakpoints`. `tailwind.config.ts` keeps the default `screens`; overriding them would need a matching breakpoints object everywhere `breakpointsTailwind` is used.

## Dialogs

Visual rules are in [DESIGN.md](DESIGN.md#dialogs-and-forms).

- Global `pt.dialog` in `nuxt.config.ts` makes every `Dialog` fullscreen below `md` (`Dialog` has no prop for it). Compact prompts opt out with `class="dialog-compact"`. `ConfirmDialog` is excluded automatically.
- Form dialogs use `SharedFormDialog` (`components/shared/FormDialog.vue`); its required `initialFocus` decides where focus starts. A dialog stacked on another sets `isolateEscape`, and the one underneath sets `suspendEscape` while the child is open: PrimeVue closes every open dialog on Escape.
- Dialogs reachable from several places are mounted once in `layouts/app.vue` and opened through a composable (`useBudgetFormDialog()`, `useReimbursementPicker()`, `useWhatsNewDialog()`).

## Layout contract (`layouts/app.vue`)

- `.app-shell` is a 100dvh flex column, padded by the top and side safe-area insets: the sidebar/content row above an in-flow `AppBottomBar` (mobile only). The document never scrolls (`app-layout-body` on `<body>`); the content scroller gets exactly the leftover height, so a page can use `h-full` for a pinned header with an inner scroll.
- Mobile `fixed` elements above the bottom bar offset by `calc(4rem+env(safe-area-inset-bottom))`.
- Every page renders `LayoutPageHeader` into the `#page-top-bar` teleport target, above the scroller; its leading control comes from `resolveHeaderLeading` (`utils/pageHeader.ts`).
- `utils/navigation.ts` is the single source of nav labels, icons and order for the sidebar, bottom bar and `NavDrawer`.
- `definePageMeta({ fullBleed: true })` drops the scroller's padding below `md` for edge-to-edge bands; sticky elements in such a page use `md:top-4`. Custom page-meta keys are typed in `app/types/page-meta.d.ts`.

## In-app upgrade

- `useUpgrade` keeps the upgrade this browser started in localStorage (`pendingUpgrade`, keyed by user id, shared across tabs); the server stays the source of truth. Phase, view and poll rules are pure functions in `utils/upgradeTracking.ts`; change them there, with tests.
- `UpgradeToast` (mounted once in the layout) owns the `upgrade` toast group and the `/system/info` poll, which runs only while an upgrade is in flight. Toasts are announced in its `onMounted`: an announcement during setup is lost.
- `reloadToNewBuild` is the only reload onto a new build, and runs only from the user's Reload action, never while polling: the PWA plugin reloads every tab when a new service worker activates.
- `useSystemInfo` is keyed per user, since `upgradeAvailable` depends on the viewer's role.

## Cross-cutting rules

- Transaction edit locks (synced rows, transfer mirrors) live in `utils/transactionForm.ts` and mirror the API's rules (`apps/api/src/transactions/AGENTS.md`); change both together.
- Reports' monthly strip (`useMonthlySpending`) fetches 24-month pages with a 30-minute `staleTime`, which bounds the FX provider calls; keep the page size and stale time together. Transaction create/update/delete must invalidate `reportKeys.all`, or the strip's cached bars disagree with the report beside them.
- Transaction attachments: validation and the parallel uploader live in `utils/attachments.ts` and `utils/attachmentUploads.ts`; gates go through `utils/appConfig.ts`; presigned URLs are fetched on demand (`useAttachmentUrl`) and never cached in vue-query.
- Ledger accounts (cash, savings; `isLedgerAccountType`): the client never computes a balance difference. It posts the new amount to `POST /accounts/:id/balance` and the API records the adjustment.
- Reimbursement mutations (`composables/transactions/useReimbursements.ts`) and card-payoff retags (`invalidateReimbursementAffected`) must invalidate transactions, budgets, reports and accounts.
- OAuth consent (`pages/oauth/consent.vue`) is reachable by client-side navigation from any route, so the API frame-blocks every response. Allow stays disabled until the page has been visible for ~1s and a trusted input arrived (`utils/consentGate.ts`, clickjacking guard). Redirect paths go through `sanitizeRedirectPath` (same-origin relative only).
