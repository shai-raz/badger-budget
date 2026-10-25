# Web Architecture (`apps/web`)

Nuxt 4.5 SPA frontend (Vite 8 / Rolldown, Lightning CSS minification). `nuxt` is pinned `~4.5.2`: 4.6.x needs Node ^22.22.3, above `.node-version`. Nuxt 4.5.2 needs Node ^22.19, which the root `engines.node` (`>=22.19`) enforces. The Docker image pins its own Node (`NODE_VERSION` in the `Dockerfile`).

- **SSR disabled** (`ssr: false`) — pure SPA
- **UI**: PrimeVue 4 (Aura theme with a custom near-black primary ramp; preset in `app/theme/preset.ts`, which sets Noir-style per-scheme primary/highlight tokens) + Tailwind CSS 3 (via `@nuxtjs/tailwindcss`) + PrimeIcons
- **State**: Pinia stores in `app/stores/`
- **Server state / data fetching**: TanStack Query via `@peterbud/nuxt-query`
- **Instance feature flags**: `useInstanceConfig()` (`composables/useInstanceConfig.ts`) wraps the public, signed-out `GET /config` (`registrationOpen`, `googleSheetsEnabled`, `fxEnabled`). Gate UI on the pure helpers in `utils/appConfig.ts`: the login register link shows only when registration is confirmed open, `/auth/register` leaves for login when it is closed, and `app.vue` runs the Google Sheets sync only when Sheets is configured. Unknown (loading or failed) config hides or skips rather than guessing.
- **Charts**: Chart.js 4 + chartjs-plugin-datalabels
- **Utilities**: VueUse (`@vueuse/nuxt`)
- **Bank sync**: `useBankSyncFlow()` is provided by the `app` layout. `BankSyncSyncFlowHost` holds the PIN dialog and passkey offer; sync controls require that layout.
- **Bank-sync passkey unlock**: lives in `useSyncUnlock` plus the pure `utils/syncPasskey*` modules (WebAuthn PRF → HKDF → AES-GCM wrapped PIN); the PIN is never persisted client-side.
- **PWA**: `@vite-pwa/nuxt` — installable, SPA-fallback offline navigation (`/api`, `/.well-known` and `/oauth` excluded from the fallback). Icons in `public/` are the light logo's mark on white; the `any` icons sit on a white disc so they still read on the dark manifest `background_color` of the Android splash.
- **Loading screen**: `app/spa-loading-template.html` shows the stacked logo, theme-matched, until the app mounts.
- API base URL is relative (`/api/v1` by default), so the web talks to the API on its own origin. `NUXT_PUBLIC_API_BASE_URL` overrides it, but it is inlined at build time, so a change needs a web rebuild. In `pnpm dev:web`, `nitro.devProxy` in `nuxt.config.ts` forwards `/api` and `/.well-known` to the API on port 3000. There is no `apps/web/.env.example`.

## CSS layer order

PrimeVue injects its styled-mode CSS into `<style>` tags at runtime, so it lands
_after_ the bundled Tailwind stylesheet in a production build but _before_ it in
dev. Left to source order that flips which of two equal-specificity rules wins
between the two modes — which is how `.p-button { position: relative }` silently
beat a `fixed` utility in production only.

`app/assets/css/tailwind.css` pins the order explicitly, and the PrimeVue theme's
`cssLayer` option (in `nuxt.config.ts`) puts its CSS into the middle layer:

```
tailwind-base  <  primevue  <  tailwind-utilities
(preflight)       (theme)      (utilities always win)
```

Both halves are required — changing one without the other reintroduces the
mismatch. Consequences worth knowing:

- Tailwind utilities reliably override PrimeVue component styles, in dev and prod alike.
- Unlayered CSS still beats everything above, so SFC `<style>` blocks and
  `primeicons.css` win over utilities. Keep SFC styles on bespoke class names.
- When changing anything here, verify a production build too — `pnpm build` then
  `node .output/server/index.mjs`. Dev alone will not show this class of bug.
- Lightning CSS (Vite 8's default minifier) drops the explicit `@layer a, b, c;`
  statement and keeps the blocks in first-appearance order, which here still gives
  the same effective order. If a prod-only mismatch appears, check the built CSS
  (`grep -o "@layer[^{;]*[;{]" .output/public/_nuxt/*.css`) and the `cssMinify`
  option (`vite.build.cssMinify: "esbuild"`) before touching the layer names.
- Global `pt` classes (below) are Tailwind utilities injected via PrimeVue, so they
  sit in the same `tailwind-utilities` layer and follow the same rule.

## Theme

- `.dark` on `<html>` is PrimeVue's `darkModeSelector`; `stores/theme.ts` owns it.
- No saved choice: the theme follows the OS and updates live. Any toggle saves `theme-preference` and wins across reloads and PWA restarts.
- `app.head` in `nuxt.config.ts` injects the inline script from `utils/theme.ts` (`THEME_INIT_SCRIPT`), which applies the theme before first paint. `app.vue` carries hex fallbacks for the html background until the PrimeVue vars load.
- The `theme-color` meta follows the theme via `useHead` in `plugins/theme.client.ts`. The manifest `theme_color` is static. iOS standalone ignores the dynamic value, so `apple-mobile-web-app-status-bar-style` stays at its default: no static value is right in both themes.

## Design rules

Surfaces, spacing, text, colour, shared building blocks and UI rules live in [DESIGN.md](DESIGN.md). Read it before any UI change.

## Page structure

Mirrors API resources: `pages/index.vue` (Overview), `pages/transactions/`, `pages/budgets/`, `pages/accounts/`, `pages/bank-connections.vue`, `pages/categories.vue`, `pages/reports/`, `pages/settings/`, plus `pages/auth/` and `pages/oauth/` (standalone, no layout).

## Editing transactions

`components/transactions/EditTransactionDialog.vue` reuses `TransactionForm` (edit mode via its `transaction` prop) and is mounted by `TransactionActionsHost` (overflow menus) and `pages/transactions/[id].vue`. A row is "synced" when it has an `externalId`; synced rows lock amount, currency, date, account, description and transfer direction, and type is restricted to the bank direction (income or transfer for money in, expense or transfer for money out). Locks and type rules live in `utils/transactionForm.ts`, and the API enforces the same rules server-side. The category picker's `creatable` mode (create and edit) holds a pending category that is created on Save via `utils/pendingCategory.ts` with a random palette colour (changeable on the categories page; no colour field); Cancel creates nothing. The form's label-row "Create rule" opens Apply category rule; when the form is dirty (including a pending category) it reads "Save & create rule" and runs the same save as Save (pending category created first), then opens the rule modal prefilled with the saved category. A transfer can link a cash wallet via the "To account" / "From account" field (cash wallets only; the received amount is editable and prefilled per the currency rule in `utils/transactionForm.ts`; an inline "Create Cash (XXX)" makes a wallet in the needed currency). The API creates a mirror row in the wallet (`counterpartOfId`); mirrors are read-only except notes (separate rule in `utils/transactionForm.ts`, enforced by the API), and their menu actions (rule, card payoff, transfer, hide, delete) are disabled with a tooltip pointing at the source. Reverting the source transfer removes the mirror. Cash-account transactions lock the form currency to the account's. In edit mode a "Looks like a cash withdrawal" hint (patterns from `GET /cash-withdrawal-patterns`, matched client-side by `utils/cashWithdrawal.ts`) offers "Move to a cash wallet", which prefills the transfer to the most recently used cash wallet in the transaction's currency. After saving a transfer that moves money into a wallet, `CashFollowupToast` (mounted in `layouts/app.vue`) offers "Record a cash payment", which opens `/transactions?create=expense&accountId=…` with the create dialog prefilled (those query keys are stripped on open).

Expense and income detail pages carry a `ReimbursementsBand` ("Reimbursements" / "Pays back"): the links on the other side with per-link Edit amount (`ReimbursementAmountDialog`, capped by `maxLinkAmount` in `utils/reimbursement.ts`) and Unlink. Its mutations live in `composables/transactions/useReimbursements.ts`, and every one invalidates transactions, budgets, reports and accounts. The edit dialog shows a read-only line (`editDialogReimbursementLine`) with a Manage link to that detail page. The link picker (`ReimbursementPickerDialog`) is mounted once in `layouts/app.vue` and opened through `useReimbursementPicker()`, like the budget dialog. It reads `useReimbursementCandidates` (search debounced, previous results kept while typing; fetches only while open and refetches on each open) and links through `useCreateReimbursement`.

Both card-payoff flows (`MarkCardPayoff` on a transaction, and Settings → Apply all) preview how many links the re-tag would delete (`useCardPayoffLinkPreview`, `useApplyAllLinkPreviewLoader`; the warning text is `linkRemovalWarning`) and report the removed count in the toast (`linksRemovedSuffix`). `MarkCardPayoff` keeps Confirm disabled until its preview settles (`awaitingLinkPreview`), so the warning is seen first. Their mutations invalidate through `invalidateReimbursementAffected`.

## Cash and savings (ledger accounts)

Cash and savings are both ledger accounts; `isLedgerAccountType` (`@badger/shared-data`) gates the shared behaviour. A cash account's balance (`balanceKind: "cash_on_hand"`) is computed by the API; a negative value means "Balance not set". The Update action (dashboard tile/row and accounts page, `components/accounts/UpdateLedgerBalanceDialog.vue` via `useUpdateLedgerBalance`) posts the new amount to `POST /accounts/:id/balance`; the client never computes the difference. Its header, label, help text and toast come from `ledgerBalanceDialogCopy` (`utils/ledgerBalanceDialog.ts`), which is cash by default and savings for `type === "savings"`; the prefill comes from `ledgerBalancePrefill`. Ledger accounts require a currency and keep one currency for their whole life: an account with `hasTransactions` has its currency locked in `AccountsFormModal`, and one with `hasLinkedTransfers` also has its type locked; the API enforces both. The accounts page's rows and tiles open one ⋮ menu (Edit, Update balance for ledger accounts, Delete); an account with linked transfers has Delete disabled there, with a tooltip. Savings accounts appear as transfer counterparts beside cash, captioned "Savings" with a piggy-bank icon. The "Record a cash payment" follow-up toast (`cashFollowupFor`) and the "Create Cash (XXX)" shortcut in the transfer picker are cash-only.

## OAuth consent and MCP settings

- `pages/oauth/consent.vue` is a standalone page (no layout) where users approve or deny an MCP client. The API returns the redirect URL after the decision and the page navigates there. The API sets frame-blocking headers (CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`) on every response, including the SPA it serves (`apps/api/src/config/spa.ts`), because the consent page is reachable via client-side navigation from any route. The workbox `navigateFallbackDenylist` also excludes `/oauth/` so the service worker never serves the cached shell there.
- Allow stays disabled until the page was visible/focused for ~1s and a trusted pointer/key event occurred (`utils/consentGate.ts`, DoubleClickjacking guard). Unverified clients are headlined by their redirect host, with the name shown as what the app "calls itself". "Not you? Sign out" goes to plain login: the request binds to the first viewer, so the user restarts from their AI app.
- Unauthenticated visits go to login with a `?redirect=` return path. `sanitizeRedirectPath` (`utils/`) accepts only same-origin relative paths; login/register keep it.
- `components/settings/McpConnectionsCard.vue` (Settings) shows the MCP server URL, setup instructions, the data-sharing notice (`utils/mcpCopy.ts`) and connected apps with revoke, via `composables/useOAuthConnections.ts`.

## Breakpoints

`md` (768px) is the mobile/desktop divide — the larger breakpoints only fine-tune
a layout, this one picks between two. Templates use Tailwind's `md:` prefix; in
script the value always comes from VueUse's `breakpointsTailwind`, never a literal.
`useIsDesktop()` wraps `useBreakpoints(breakpointsTailwind).greaterOrEqual("md")`.

`BELOW_MD` (`app/utils/breakpoints.ts`) is the same divide as a `max-width`
media-query string, for props that take one instead of a reactive ref, such as
PrimeVue's `breakpoints`. Responsive PrimeVue overlays use that prop — e.g. the
`<Toast>` in `layouts/app.vue` — rather than CSS overrides.

`tailwind.config.ts` doesn't override `screens`, so Tailwind's defaults (and
`breakpointsTailwind`) match. A custom `screens` config would need a matching
custom breakpoints object in place of `breakpointsTailwind` everywhere above.

## Dialogs

Mechanics only. The visual rules (titles, close, focus policy, sentence case) are in [DESIGN.md](DESIGN.md#dialogs-and-forms).

- Global `pt.dialog` in `nuxt.config.ts` carries the title styling and the fullscreen-below-`md` root. `Dialog` has no fullscreen prop beyond width, which is why this is a global `pt` rather than per-instance props. `ConfirmDialog` is excluded automatically (`.p-confirmdialog`).
- Compact dialogs and tiny prompts opt out of fullscreen with `class="dialog-compact"` (plus `max-w-[95vw]`): `DeleteCategoryDialog`, `MarkCardPayoff`, `PasskeysCard` (Add passkey), `BankSyncSyncFlowHost` (Sync PIN), `UpdateLedgerBalanceDialog`, `UpdateDialog`.
- Dialog content is a scroll container with no top padding, which clipped a first-child `Message`'s outline; the theme's `dialog` header/content padding moves 0.25rem from the header to the content to fix that. The root pads the `env(safe-area-inset-*)` insets.
- Focus: PrimeVue's `Dialog` focuses the first `[autofocus]` in its content, else the close button. `SharedFormDialog` (`components/shared/FormDialog.vue`) sets that from its required `initialFocus`: `field` marks the form's first input `autofocus`; `dialog` gives a `tabindex="-1" autofocus` body wrapper, so focus lands on the dialog itself.
- Form dialogs use `SharedFormDialog`: a `Dialog` with the API-error banner above the body and Cancel/Save in a pinned `#footer`.

## Layout contract (`layouts/app.vue`)

`.app-shell` 100dvh flex column (100vh fallback; bespoke class because `h-screen h-dvh` loses to Tailwind's emit order), padded by the top/side safe-area insets: sidebar/content row above an in-flow `AppBottomBar` (mobile only), so the scroller gets exactly the leftover height and a page can take `h-full` for a pinned-header + inner-scroll layout. The document never scrolls in this layout (`app-layout-body` on `<body>` via `useHead` → overflow hidden + overscroll-behavior none; the scroller is `overscroll-y-contain`). `AppBottomBar` pads `env(safe-area-inset-bottom)`, so mobile `fixed` elements above it (e.g. the transactions FAB) offset by `calc(4rem+env(safe-area-inset-bottom))`.

- `#page-top-bar` — teleport target above the scroller, outside its padding, so the page header's bar and border span the full width.
- `LayoutPageHeader` (`components/layout/PageHeader.vue`) — the header every page renders into `#page-top-bar`. Props: `title`, `backTo`, `overflowItems` (ellipsis menu), `overflowLabel`. Slots: `actions` (max two visible), `toolbar` (inline on desktop, its own row under the title on mobile; rendered once). Leading is `resolveHeaderLeading` (`utils/pageHeader.ts`): child pages get back at every breakpoint; top-level pages get the hamburger below `md` and nothing on desktop. Action buttons use `LayoutHeaderButton`: labelled on desktop (filled for `primary` create actions, outlined otherwise); on mobile a plain icon-only text button matching the hamburger/⋮, whatever `primary` is. The header sets their height, so they take no size props. Header pages put `<LayoutHeaderSync />` (`components/layout/HeaderSync.vue`, last-synced time from `utils/lastSynced.ts`) in the `actions` slot instead of `SyncButton`.
- `NavDrawer` (`components/layout/NavDrawer.vue`) — mobile-only left drawer mounted once in the layout, opened via `useNavDrawer()`. Holds the routes the bottom bar lacks in its list, and in the footer the actions, a labelled "Dark mode" ToggleSwitch and the user with logout. Its rows use their own class that bleeds into the drawer's side padding, so every row's text lines up with "Dark mode". Nav labels, icons and order come from `utils/navigation.ts`, the single source for sidebar, bottom bar and drawer. `NAV_ACTIONS` (update, what's new) are dialog openers kept out of every route list; the sidebar (at the bottom of its list) and the drawer (at the top of its footer) render the update item while a release is pending, then "What's new", which is always shown.
- `UpdateDialog` (`components/layout/UpdateDialog.vue`) — the "Update available" dialog, mounted once here. Opened from the nav's update item (sidebar bottom group, drawer list) and the hamburger's dot badge, both shown only while `useUpdateNotice().visible`. Dismiss records the version in this browser (`updateNoticeDismissedVersion` in localStorage), so a newer release brings the notice back. After a manual "Check again" finds nothing newer, the dialog retitles to "No update available" and drops Dismiss.
- `WhatsNewDialog` (`components/layout/WhatsNewDialog.vue`) — the "What's new" dialog from the bundled changelog (`GET /system/changelog`, `useChangelog`), mounted once here; state lives in `useWhatsNewDialog()`. Once per app load, `whatsNewStartAction` (`utils/whatsNew.ts`) decides: a newer build with unseen notes opens it on the unseen releases; a user never stamped (`lastSeenVersion` null) or with nothing to show is stamped silently. Closing it by any path stores the running version (`POST /system/changelog/seen`) after the dialog hides, so it does not reopen. The nav's "What's new" item opens the most recent releases and is always visible.
- `BudgetFormDialog` (`components/budgets/BudgetFormDialog.vue`) — the New/Edit budget dialog, mounted once here like `NavDrawer`. Every entry point opens it in place through `useBudgetFormDialog()` (`composables/useBudgetFormDialog.ts`); no budget create or edit route exists.
- `definePageMeta({ fullBleed: true })` — drops the scroller's `p-4` below `md` (desktop keeps it) for pages whose sections run edge to edge, separated by gaps and each section's own top/bottom border (see [DESIGN.md](DESIGN.md)). A sticky element in such a page uses `md:top-4` (the desktop padding); the header lives in `#page-top-bar`, outside the scroller, so it can't be overlapped. Custom page-meta keys are typed in `app/types/page-meta.d.ts`.
