// Source-text contract test: mobile dynamic-toolbar behaviour can't be exercised in node/jsdom,
// so this guards the CSS invariants behind #153/#154 (app shell pinned to the dynamic viewport,
// document scroll locked, safe-area-aware bottom bar).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const layout = read("./app.vue");
const rootApp = read("../app.vue");
const bottomBar = read("../components/layout/AppBottomBar.vue");
const sidebar = read("../components/layout/AppSidebar.vue");
const transactionsPage = read("../pages/transactions/index.vue");
const transactionsToolbar = read("../components/transactions/Toolbar.vue");
const filtersSheet = read("../components/transactions/FiltersSheet.vue");
const nuxtConfig = read("../../nuxt.config.ts");
const themePreset = read("../theme/preset.ts");
const transactionForm = read("../components/transactions/TransactionForm.vue");
const pageHeader = read("../components/layout/PageHeader.vue");
const navDrawer = read("../components/layout/NavDrawer.vue");
const updateDialog = read("../components/layout/UpdateDialog.vue");
const budgetFormDialog = read("../components/budgets/BudgetFormDialog.vue");

describe("app shell viewport contract", () => {
    it("sizes the layout shell with 100vh then 100dvh instead of h-screen", () => {
        const styleStart = layout.indexOf("<style");
        const template = styleStart === -1 ? layout : layout.slice(0, styleStart);
        const style = styleStart === -1 ? "" : layout.slice(styleStart);

        expect(template).not.toContain("h-screen");
        expect(template).toContain('class="app-shell');
        expect(style).toContain(".app-shell");
        expect(style).toContain("height: 100vh");
        expect(style).toContain("height: 100dvh");
        expect(style.indexOf("height: 100vh")).toBeLessThan(style.indexOf("height: 100dvh"));
    });

    it("tags the body with app-layout-body via useHead bodyAttrs", () => {
        expect(layout).toMatch(/bodyAttrs[\s\S]*app-layout-body/);
    });

    it("contains overscroll on the content scroller", () => {
        expect(layout).toContain("overscroll-y-contain");
    });

    it("locks document scroll globally while the app layout is mounted", () => {
        expect(rootApp).toContain("body.app-layout-body");
        expect(rootApp).toContain("html:has(> body.app-layout-body)");
        expect(rootApp).toContain("overflow: hidden");
        expect(rootApp).toContain("overscroll-behavior: none");
    });

    it("declares viewport-fit=cover in nuxt.config", () => {
        expect(nuxtConfig).toContain('name: "viewport"');
        expect(nuxtConfig).toContain("viewport-fit=cover");
    });

    it("pads the bottom bar by the bottom safe-area inset", () => {
        expect(bottomBar).toContain("pb-[env(safe-area-inset-bottom)]");
    });

    it("renders the bottom bar and sidebar from the shared nav config", () => {
        expect(bottomBar).toContain("BOTTOM_BAR_ITEMS");
        expect(sidebar).toContain("SIDEBAR_ITEMS");
    });

    // Four evenly spaced tabs at 390px; Accounts lives in the drawer, so the bar no longer has five columns.
    it("lays the bottom bar out as four equal columns", () => {
        expect(bottomBar).toContain("grid-cols-4");
        expect(bottomBar).not.toContain("grid-cols-5");
    });

    // Logout is an action, not a route: a /logout NuxtLink has no matching route and caused the
    // "No match found for location" warning (#76).
    it("logs out from the sidebar via useLogout instead of a /logout route", () => {
        expect(sidebar).not.toContain("/logout");
        expect(sidebar).toContain("useLogout");
    });

    it("lifts the transactions FAB above the taller bottom bar", () => {
        expect(transactionsPage).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
        expect(transactionsPage).not.toContain(" bottom-16 ");
    });

    // The FAB is the mobile create action; its glyph is text-xl so it sits in proportion to the 48px button.
    it("sizes the transactions FAB icon at text-xl", () => {
        expect(transactionsPage).toContain("pi pi-plus text-xl");
        expect(transactionsPage).not.toContain("pi pi-plus text-2xl");
    });

    // The mobile toolbar lives in LayoutPageHeader's second row, so it must not bring its own title or sync.
    it("keeps the transactions toolbar free of its own h1 and SyncButton", () => {
        expect(transactionsToolbar).not.toContain("<h1");
        expect(transactionsToolbar).not.toContain("<SyncButton");
    });

    it("keeps the FiltersSheet footer clear of the bottom inset", () => {
        expect(filtersSheet).toContain("pb-[calc(1rem+env(safe-area-inset-bottom))]");
    });

    it("pads auth and consent pages by the safe-area insets", () => {
        for (const rel of ["../pages/auth/login.vue", "../pages/auth/register.vue", "../pages/oauth/consent.vue"]) {
            expect(read(rel)).toContain("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
        }
    });

    // Nuxt auto-registers components/transactions/CashFollowupToast.vue as
    // TransactionsCashFollowupToast, so the bare tag never resolves and the toast never mounts.
    it("imports CashFollowupToast explicitly in the layout", () => {
        expect(layout).toContain('import CashFollowupToast from "~/components/transactions/CashFollowupToast.vue"');
    });

    // Dialog content has no top padding in Aura, which clipped a first-child Message's outline.
    it("gives dialog content a top padding so first-child Message outlines are not clipped", () => {
        expect(themePreset).toContain('padding: "0.25rem 1.25rem 1.25rem 1.25rem"');
        expect(themePreset).toContain('padding: "1.25rem 1.25rem 1rem"');
    });

    it("disables the enter animation on the two TransactionForm banners only", () => {
        expect(transactionForm.match(/:pt="\{ transition: \{ appear: false \} \}"/g)).toHaveLength(2);
    });

    // Explicit import: Nuxt would auto-register it as LayoutNavDrawer, so the bare tag would not resolve.
    it("mounts the NavDrawer exactly once, from the layout", () => {
        expect(layout).toContain('import NavDrawer from "~/components/layout/NavDrawer.vue"');
        expect(layout.match(/<NavDrawer/g)).toHaveLength(1);
    });

    // Explicit import for the same reason: the budget create/edit dialog is opened from several pages, so it
    // lives once in the layout rather than on each page.
    it("mounts the budget form dialog exactly once, from the layout", () => {
        expect(layout).toContain('import BudgetFormDialog from "~/components/budgets/BudgetFormDialog.vue"');
        expect(layout.match(/<BudgetFormDialog/g)).toHaveLength(1);
    });

    it("keeps the budget dialog's header, focus rule and busy wiring on SharedFormDialog", () => {
        expect(budgetFormDialog).toContain("SharedFormDialog");
        expect(budgetFormDialog).toContain("'Edit budget' : 'New budget'");
        expect(budgetFormDialog).toContain("isEdit ? 'dialog' : 'field'");
    });

    // The footer is pinned to the bottom of a full-height drawer, so it clears the iOS home-indicator inset.
    it("pads the NavDrawer footer by the bottom safe-area inset", () => {
        expect(navDrawer).toContain("pb-[env(safe-area-inset-bottom)]");
    });

    it("opens the NavDrawer from the left and closes it on route change and logout", () => {
        expect(navDrawer).toContain('position="left"');
        expect(navDrawer).toContain("route.fullPath");
        expect(navDrawer).toContain("useLogout");
    });

    // The theme switch lives in the drawer footer, outside the list, as a labelled ToggleSwitch: the label
    // gives the accessible name and the native switch input makes Space toggle it.
    it("puts the theme switch in the NavDrawer footer, labelled, outside the nav list", () => {
        expect(navDrawer).toContain("<ToggleSwitch");
        expect(navDrawer).toContain("#footer");
        expect(navDrawer).toContain(':input-id="themeSwitchId"');
        expect(navDrawer).toContain("pi-moon");
        expect(navDrawer).toContain("pi-sun");
        expect(navDrawer).toContain("Dark mode");
        expect(navDrawer).not.toContain("Light mode");
        expect(navDrawer).not.toContain("toggleTheme");
    });

    it("gives PageHeader the back and menu buttons, the single title and resolves leading via the pure util", () => {
        expect(pageHeader).toContain('aria-label="Back"');
        expect(pageHeader).toContain("hamburgerLabel(updateVisible)");
        expect(pageHeader).toContain("resolveHeaderLeading");
        expect(pageHeader).toContain("<h1");
    });

    // The update item lives in the sidebar bottom group and the drawer footer, and opens the layout-mounted dialog.
    it("renders the update nav item from NAV_ACTIONS in the sidebar and drawer, opening UpdateDialog", () => {
        expect(sidebar).toContain("NAV_ACTIONS.update");
        expect(sidebar).toContain("openDialog()");
        expect(sidebar).toContain("mt-auto");
        expect(navDrawer).toContain("NAV_ACTIONS.update");
        expect(navDrawer).toContain("closeDrawer();");
        expect(navDrawer).toContain("openDialog();");
        expect(layout).toContain("<UpdateDialog />");
    });

    // The drawer's actions open its footer, directly above the theme switch's divider, rather than ending the
    // nav list: there the content and footer paddings left a gap between them and the footer.
    it("puts the drawer's actions at the top of its footer, above the theme switch", () => {
        const nav = navDrawer.slice(navDrawer.indexOf("<nav"), navDrawer.indexOf("</nav>"));
        const footer = navDrawer.slice(navDrawer.indexOf("#footer"));
        expect(nav).not.toContain("NAV_ACTIONS");
        expect(footer.indexOf("NAV_ACTIONS.update")).toBeGreaterThan(-1);
        expect(footer.indexOf("NAV_ACTIONS.whatsNew")).toBeGreaterThan(footer.indexOf("NAV_ACTIONS.update"));
        expect(footer.indexOf("Dark mode")).toBeGreaterThan(footer.indexOf("NAV_ACTIONS.whatsNew"));
    });

    // Routes and actions share one row class, so every row's text lines up with the footer's "Dark mode".
    it("gives the drawer's routes and actions the same row class", () => {
        expect(navDrawer.match(/:class="\[?DRAWER_ROW_CLASS/g)).toHaveLength(3);
        expect(navDrawer).not.toContain("NAV_LINK_CLASS");
    });

    // After a manual check finds nothing newer, the header and footer stop offering an update.
    it("retitles UpdateDialog and drops Dismiss once the check is up to date", () => {
        expect(updateDialog).toContain("upToDate ? 'No update available' : 'Update available'");
        expect(updateDialog).toMatch(/v-if="!upToDate"\s+label="Dismiss for this version"/);
    });

    it("badges the hamburger with a decorative dot only while the update notice is visible", () => {
        expect(pageHeader).toContain("useUpdateNotice");
        expect(pageHeader).toContain('v-if="updateVisible"');
        expect(pageHeader).toContain('aria-hidden="true"');
    });
});
