// Source-text contract for the unified page header (#17): every app-layout page renders its title
// through LayoutPageHeader, and only layouts/app.vue mounts a ConfirmDialog (#170).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const pagesDir = fileURLToPath(new URL("../pages", import.meta.url));

const toPosix = (p: string) => p.replace(/\\/g, "/");
const vueFiles = (dir: string) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map(toPosix)
        .filter((rel) => rel.endsWith(".vue"));

const pageFiles = vueFiles(pagesDir).filter((rel) => !rel.startsWith("auth/") && !rel.startsWith("oauth/"));

describe("page header contract", () => {
    it.each(pageFiles)("%s renders its title through LayoutPageHeader without a bare h1", (rel) => {
        const source = readFileSync(`${pagesDir}/${rel}`, "utf8");
        expect(source).toContain("<LayoutPageHeader");
        expect(source).not.toContain("<h1");
    });

    // Titles and back targets are per-page strings, so pin them: a change must not quietly point
    // edit back at /budgets or bring back "Create Budget".
    const headerTag = (rel: string) =>
        readFileSync(`${pagesDir}/${rel}`, "utf8").match(/<LayoutPageHeader\b[^>]*>/)?.[0];

    it.each([
        ["budgets/[id]/index.vue", 'title="Budget"', 'back-to="/budgets"'],
        ["transactions/[id].vue", 'title="Transaction"', 'back-to="/transactions"'],
        ["settings/card-payoff-patterns.vue", 'title="Card payoff patterns"', 'back-to="/settings"'],
    ])("%s keeps its title and back target", (rel, title, backTo) => {
        const tag = headerTag(rel);
        expect(tag).toContain(title);
        expect(tag).toContain(backTo);
    });

    it.each([
        ["index.vue", 'title="Overview"'],
        ["budgets/index.vue", 'title="Budgets"'],
        ["reports/index.vue", 'title="Reports"'],
        ["transactions/index.vue", 'title="Transactions"'],
    ])("%s is a top-level page with no back target", (rel, title) => {
        const tag = headerTag(rel);
        expect(tag).toContain(title);
        expect(tag).not.toContain("back-to");
    });

    it("deletes the retired PageTopBar and AppHeader components", () => {
        expect(existsSync(`${appDir}/components/layout/PageTopBar.vue`)).toBe(false);
        expect(existsSync(`${appDir}/components/layout/AppHeader.vue`)).toBe(false);
    });

    // Desktop used to drop the explicit aria-label, so a screen reader heard "New" instead of "New budget".
    it("gives the desktop header button the same accessible name as mobile", () => {
        const headerButton = readFileSync(`${appDir}/components/layout/HeaderButton.vue`, "utf8");
        expect(headerButton.match(/:aria-label="ariaLabel \?\? label"/g)).toHaveLength(2);
    });

    // Mobile ignores `primary` so the filled round "+" stays unique to the Transactions FAB.
    it("renders the mobile header button as a plain icon, whatever primary is", () => {
        const source = readFileSync(`${appDir}/components/layout/HeaderButton.vue`, "utf8");
        const [desktop = "", mobile = ""] = source.split("<template>")[1]?.split("v-else") ?? [];
        expect(mobile).not.toContain("primary");
        expect(mobile).toMatch(/\stext\b/);
        expect(mobile).toContain("rounded");
        expect(mobile).toContain('severity="secondary"');
        expect(desktop).toContain("primary");
    });

    // Reports keeps its period picker on the title row (PageHeader #controls), not in the toolbar slot.
    it("puts the Reports period picker in the controls slot", () => {
        const source = readFileSync(`${pagesDir}/reports/index.vue`, "utf8");
        expect(source).toContain("<template #controls>");
        expect(source).toContain("<SharedPeriodPicker");
        expect(source).not.toContain("#toolbar");
        expect(source).not.toContain("SelectButton");
    });

    it("serves bank connections from their own page, not Accounts", () => {
        expect(readFileSync(`${pagesDir}/bank-connections.vue`, "utf8")).toContain("<BankSyncScraperConnectionModal");
        expect(readFileSync(`${pagesDir}/accounts/index.vue`, "utf8")).not.toContain("BankSyncScraperConnectionModal");
    });

    // The Overview empty state is the first place a new user is told to connect a bank; it must not
    // point back at Accounts, which no longer offers bank connecting.
    it("sends the Overview accounts empty state to bank connections", () => {
        const section = readFileSync(`${appDir}/components/dashboard/AccountsSection.vue`, "utf8");
        expect(section).toContain('to="/bank-connections"');
        // Whitespace before `to` keeps SharedSectionBand's `link-to="/accounts"` (the section header) out of the match.
        expect(section).not.toMatch(/\sto="\/accounts"/);
    });

    it("mounts ConfirmDialog only in layouts/app.vue", () => {
        const withConfirmDialog = vueFiles(appDir)
            .filter((rel) => readFileSync(`${appDir}/${rel}`, "utf8").includes("<ConfirmDialog"))
            .sort();
        expect(withConfirmDialog).toEqual(["layouts/app.vue"]);
    });
});
