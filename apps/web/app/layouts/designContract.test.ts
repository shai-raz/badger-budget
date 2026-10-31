// Source-text contract for the design foundations (#18): PrimeFlex is not installed, so its classes
// silently do nothing. No class token in an app .vue file may use a PrimeFlex name.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("..", import.meta.url));

const toPosix = (p: string) => p.replace(/\\/g, "/");
const vueFiles = (dir: string) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map(toPosix)
        .filter((rel) => rel.endsWith(".vue"));

const PRIMEFLEX_CLASS =
    /^(flex-column(-reverse)?|justify-content-\S+|align-items-\S+|align-self-\S+|align-content-\S+|text-[1-9]00|surface-(ground|card|border|section|overlay|hover|\d+)|border-round(-\S+)?|field|formgrid|p-fluid|col-\d+|flex-order-\d+)$/;

// Static `class="…"` values, plus the string literals inside `:class="…"` bindings.
const STATIC_CLASS = /\sclass=(?:"([^"]*)"|'([^']*)')/g;
const BOUND_CLASS = /:class=(?:"([^"]*)"|'([^']*)')/g;
const STRING_LITERAL = /'([^']*)'|`([^`$]*)`/g;

// Each static `class="…"` value, and each whole `:class="…"` expression.
const classValues = (source: string): string[] => [
    ...[...source.matchAll(STATIC_CLASS)].map((match) => match[1] ?? match[2] ?? ""),
    ...[...source.matchAll(BOUND_CLASS)].map((match) => match[1] ?? match[2] ?? ""),
];

// The class names in one value, with variant prefixes kept. A bound expression names its classes in its
// string literals; a static value is the class list itself.
const valueTokens = (value: string): string[] => {
    const literals = [...value.matchAll(STRING_LITERAL)].map((literal) => literal[1] ?? literal[2] ?? "");
    return (literals.length > 0 ? literals : [value]).flatMap((text) => text.split(/\s+/)).filter(Boolean);
};

const utilityOf = (token: string): string => token.split(":").pop() ?? token;

const classTokens = (source: string): string[] =>
    // Variant prefixes (`md:`, `dark:`, `[&>div]:`) don't change which utility is named.
    classValues(source).flatMap(valueTokens).map(utilityOf);

describe("design contract: shared section band", () => {
    it("removes DashboardSection in favour of SharedSectionBand", () => {
        expect(existsSync(`${appDir}/components/dashboard/DashboardSection.vue`)).toBe(false);
    });

    it("uses no <DashboardSection in any app .vue file", () => {
        const offenders = vueFiles(appDir).filter((rel) =>
            readFileSync(`${appDir}/${rel}`, "utf8").includes("<DashboardSection"),
        );
        expect(offenders).toEqual([]);
    });

    it("keeps the section label style in SectionBand.vue exactly once", () => {
        const source = readFileSync(`${appDir}/components/shared/SectionBand.vue`, "utf8");
        expect(source.split("uppercase tracking-wide").length - 1).toBe(1);
    });

    it("uses the section label class string only in SectionBand.vue", () => {
        const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-color";
        expect(readFileSync(`${appDir}/components/shared/SectionBand.vue`, "utf8")).toContain(LABEL);
        const offenders = vueFiles(appDir).filter(
            (rel) =>
                rel !== "components/shared/SectionBand.vue" && readFileSync(`${appDir}/${rel}`, "utf8").includes(LABEL),
        );
        expect(offenders).toEqual([]);
    });
});

describe("design contract: shared period picker", () => {
    it("removes MonthRangePicker in favour of SharedPeriodPicker", () => {
        expect(existsSync(`${appDir}/components/shared/MonthRangePicker.vue`)).toBe(false);
    });

    it("uses no <SharedMonthRangePicker in any app .vue file", () => {
        const offenders = vueFiles(appDir).filter((rel) =>
            readFileSync(`${appDir}/${rel}`, "utf8").includes("SharedMonthRangePicker"),
        );
        expect(offenders).toEqual([]);
    });
});

describe("design contract: PrimeFlex classes", () => {
    it("bans no PrimeFlex class in any app .vue file", () => {
        const offenders = vueFiles(appDir).flatMap((rel) => {
            const source = readFileSync(`${appDir}/${rel}`, "utf8");
            return classTokens(source)
                .filter((token) => PRIMEFLEX_CLASS.test(token))
                .map((token) => `${rel}: "${token}" is a PrimeFlex class (not installed); use its Tailwind equivalent`);
        });
        expect(offenders).toEqual([]);
    });

    it.each(["text-primary", "text-muted-color", "border-surface", "bg-emphasis", "flex-row", "flex-shrink-0"])(
        "keeps %s allowed",
        (token) => {
            expect(PRIMEFLEX_CLASS.test(token)).toBe(false);
        },
    );

    it("finds PrimeFlex classes in static and bound class attributes", () => {
        const sample = `<div class="flex flex-column"><span :class="{ 'text-500': x, 'items-center': y }" /></div>`;
        expect(classTokens(sample).filter((token) => PRIMEFLEX_CLASS.test(token))).toEqual(["flex-column", "text-500"]);
    });
});

describe("design contract: dark-mode text colours", () => {
    // Muted text is text-muted-color (surface-500 light, surface-400 dark). A bare surface-500/600 is too dim on a
    // dark surface unless it has a dark: partner, and a raw primary ramp step ignores the per-scheme primary.
    // Scope limits (deliberate, to keep the scanner narrow): it reads only static and bound class attributes in
    // .vue templates, so a class string kept in a <script> block or a .ts constant (CHIP_*, transactionAmountClass,
    // BUDGET_LEVEL_TEXT_CLASS) is not checked. Any dark:text-* token counts as the dark partner, so a dim pair
    // such as `text-surface-500 dark:text-surface-600` passes; review those by eye.
    const PRIMARY_RAMP = /^text-primary-\d+$/;
    const BARE_MUTED = /^text-surface-(500|600)$/;

    const darkTextViolations = (rel: string, source: string): string[] =>
        classValues(source).flatMap((value) => {
            const tokens = valueTokens(value);
            const ramp = tokens
                .filter((token) => PRIMARY_RAMP.test(utilityOf(token)))
                .map((token) => `${rel}: "${token}" is a raw primary ramp step; use text-primary`);
            const bare = tokens.find((token) => !token.includes(":") && BARE_MUTED.test(token));
            const hasDarkPartner = tokens.some((token) => token.startsWith("dark:text-"));
            const muted =
                bare && !hasDarkPartner
                    ? [
                          `${rel}: "${bare}" is muted text with no dark: partner; use text-muted-color or add a dark: partner`,
                      ]
                    : [];
            return [...ramp, ...muted];
        });

    it("bans no raw primary ramp step in any app .vue file", () => {
        const offenders = vueFiles(appDir).flatMap((rel) =>
            darkTextViolations(rel, readFileSync(`${appDir}/${rel}`, "utf8")).filter((message) =>
                message.includes("raw primary"),
            ),
        );
        expect(offenders).toEqual([]);
    });

    it("bans a bare surface-500/600 text colour with no dark: partner in any app .vue file", () => {
        const offenders = vueFiles(appDir).flatMap((rel) =>
            darkTextViolations(rel, readFileSync(`${appDir}/${rel}`, "utf8")).filter((message) =>
                message.includes("no dark: partner"),
            ),
        );
        expect(offenders).toEqual([]);
    });

    it("flags a bare text-surface-500 and allows its dark: partner or text-muted-color", () => {
        expect(darkTextViolations("fixture.vue", '<p class="text-xs text-surface-500">')).toHaveLength(1);
        expect(darkTextViolations("fixture.vue", '<p class="text-surface-500 dark:text-surface-400">')).toEqual([]);
        expect(darkTextViolations("fixture.vue", '<p class="text-muted-color">')).toEqual([]);
    });

    it("flags a raw primary ramp step inside a bound class object", () => {
        expect(darkTextViolations("fixture.vue", `<p :class="{ 'text-primary-500': a }">`)).toHaveLength(1);
    });
});

describe("design contract: amount colours come from theme tokens", () => {
    // Amount and budget colours read the theme (text-income, text-income-strong, text-expense), so a theme can
    // recolour them. Raw teal and rose steps are banned in components, pages, layouts and utils, except for the
    // two allow-listed files below, whose colours are not amounts.
    const RAW_AMOUNT_COLOUR = /text-teal-\d|text-rose-500/;
    const ALLOW_LIST = [
        // The Delete menu item: a destructive status colour, not an amount.
        "pages/accounts/index.vue",
        // File-type icons: teal for images, rose for PDFs. A file kind, not an amount.
        "utils/attachments.ts",
    ];
    const sourceFiles = ["components", "pages", "layouts", "utils"].flatMap((dir) =>
        readdirSync(`${appDir}/${dir}`, { recursive: true, encoding: "utf8" })
            .map(toPosix)
            .filter((rel) => /\.(vue|ts)$/.test(rel) && !rel.endsWith(".test.ts"))
            .map((rel) => `${dir}/${rel}`),
    );
    const readSource = (rel: string) => readFileSync(`${appDir}/${rel}`, "utf8");

    it("scans the amount-bearing components, pages and utils", () => {
        expect(sourceFiles).toEqual(
            expect.arrayContaining(["components/transactions/formatters.ts", "pages/transactions/[id].vue"]),
        );
    });

    it("keeps raw teal and rose amount colours out of the scanned sources", () => {
        const offenders = sourceFiles.filter(
            (rel) => !ALLOW_LIST.includes(rel) && RAW_AMOUNT_COLOUR.test(readSource(rel)),
        );
        expect(offenders).toEqual([]);
    });

    it.each(ALLOW_LIST)("%s still uses a raw colour, so its allow-list entry is needed", (rel) => {
        expect(RAW_AMOUNT_COLOUR.test(readSource(rel))).toBe(true);
    });

    it("matches a raw teal or rose class and not the theme tokens", () => {
        expect(RAW_AMOUNT_COLOUR.test("text-teal-500")).toBe(true);
        expect(RAW_AMOUNT_COLOUR.test("text-teal-600")).toBe(true);
        expect(RAW_AMOUNT_COLOUR.test("text-rose-500")).toBe(true);
        expect(RAW_AMOUNT_COLOUR.test("text-income text-income-strong text-expense")).toBe(false);
    });
});

describe("design contract: spending donut follows the theme store", () => {
    // The theme store is the one source of dark mode; a DOM observer on <html>.class would drift from it.
    const source = readFileSync(`${appDir}/components/dashboard/SpendingDonut.vue`, "utf8");

    it("reads dark mode from useThemeStore and not from a MutationObserver", () => {
        expect(source).toContain("useThemeStore()");
        expect(source).toContain("computed(() => themeStore.isDark)");
        expect(source).not.toContain("MutationObserver");
    });

    it("keys the Chart remount on the store's colour theme and dark flag", () => {
        expect(source).toContain("`${themeStore.colorTheme}-${isDark ? 'dark' : 'light'}`");
    });
});

describe("design contract: status callouts use PrimeVue Message", () => {
    // The bank-sync edit hint and PIN fallback are status callouts, so they render through Message (info stays blue).
    const source = readFileSync(`${appDir}/components/bankSync/ScraperConnectionModal.vue`, "utf8");

    it("renders the edit hint through an info Message, not a hand-rolled blue box", () => {
        expect(source).toMatch(/<Message\s+v-if="isEditMode"\s+severity="info"/);
        expect(source).not.toContain("bg-blue-50");
    });

    it("renders the PIN fallback reason through a warn Message, not orange text", () => {
        expect(source).toMatch(/<Message\s+v-if="pinFallbackReason"\s+severity="warn"/);
        expect(source).not.toContain("text-orange-600");
    });
});

describe("design contract: budget progress bar", () => {
    it("renders budget progress only through components/budgets/BudgetProgressBar.vue", () => {
        const offenders = vueFiles(appDir).filter((rel) => {
            if (rel === "components/budgets/BudgetProgressBar.vue") return false;
            const source = readFileSync(`${appDir}/${rel}`, "utf8");
            return (
                source.includes("budget-progress-") ||
                (source.includes("ProgressBar") && source.includes("BUDGET_LEVEL_COLOR"))
            );
        });
        expect(offenders).toEqual([]);
    });

    // Raw PrimeVue <ProgressBar> (not <BudgetsBudgetProgressBar>) on a budget surface skips the level colours.
    const RAW_PROGRESS_BAR = /<ProgressBar[\s>]/;
    const isBudgetSurface = (rel: string) =>
        rel !== "components/budgets/BudgetProgressBar.vue" &&
        (rel.startsWith("components/budgets/") ||
            rel.startsWith("pages/budgets/") ||
            rel === "components/dashboard/BudgetsSection.vue");

    it("uses no raw <ProgressBar on budget surfaces", () => {
        const offenders = vueFiles(appDir).filter(
            (rel) => isBudgetSurface(rel) && RAW_PROGRESS_BAR.test(readFileSync(`${appDir}/${rel}`, "utf8")),
        );
        expect(offenders).toEqual([]);
    });

    it("matches a raw <ProgressBar but not the budget wrapper", () => {
        expect(RAW_PROGRESS_BAR.test(`<ProgressBar :value="50" :show-value="false" />`)).toBe(true);
        expect(RAW_PROGRESS_BAR.test(`<BudgetsBudgetProgressBar :percentage="50" />`)).toBe(false);
    });
});

describe("design contract: fullBleed band pages", () => {
    // Pages whose sections run edge to edge on mobile opt out of the scroller's padding.
    const FULL_BLEED_PAGES = [
        "pages/index.vue",
        "pages/transactions/index.vue",
        "pages/budgets/index.vue",
        "pages/budgets/[id]/index.vue",
        "pages/accounts/index.vue",
        "pages/reports/index.vue",
        "pages/bank-connections.vue",
        "pages/categories.vue",
        "pages/settings/index.vue",
        "pages/settings/card-payoff-patterns.vue",
        "pages/transactions/[id].vue",
    ];

    it.each(FULL_BLEED_PAGES)("%s sets fullBleed: true", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain("fullBleed: true");
    });

    // No floating cards: every app page (auth and OAuth are standalone centred cards) is fullBleed, so a new page can't skip it.
    const APP_PAGES = vueFiles(`${appDir}/pages`)
        .filter((rel) => !/^(auth|oauth)\//.test(rel))
        .map((rel) => `pages/${rel}`);

    it("finds the app pages under pages/", () => {
        expect(APP_PAGES).toEqual(expect.arrayContaining(FULL_BLEED_PAGES));
    });

    it.each(APP_PAGES)("%s is fullBleed and draws no Card or Panel", (rel) => {
        const source = readFileSync(`${appDir}/${rel}`, "utf8");
        expect(source).toContain("fullBleed: true");
        expect(source).not.toContain("<Card");
        expect(source).not.toContain("<Panel");
    });

    it("deletes the period nav and the budget card, replaced by the stepper and the shared row", () => {
        expect(existsSync(`${appDir}/components/budgets/BudgetPeriodNav.vue`)).toBe(false);
        expect(existsSync(`${appDir}/components/budgets/BudgetCard.vue`)).toBe(false);
    });
});

describe("design contract: reports and bank connection bands", () => {
    // Reports and Bank connections are bands, not floating cards: the sections and their rows carry the chrome.
    const BAND_SURFACES = [
        "pages/reports/index.vue",
        "pages/bank-connections.vue",
        "components/reports/TotalSpendingCard.vue",
        "components/reports/CategoryBreakdownList.vue",
    ];

    it.each(BAND_SURFACES)("%s draws no <Card", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).not.toContain("<Card");
    });

    it("renders the bank connection section through SharedSectionBand", () => {
        expect(readFileSync(`${appDir}/pages/bank-connections.vue`, "utf8")).toContain("<SharedSectionBand");
    });
});

describe("design contract: categories and payoff patterns", () => {
    // Both are bands: the section carries the chrome, rows below md and a table on desktop.
    it.each(["pages/categories.vue", "pages/settings/card-payoff-patterns.vue"])("%s draws no <Card", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).not.toContain("<Card");
    });

    it("renders the categories list with the icon avatar and a desktop/mobile split", () => {
        const source = readFileSync(`${appDir}/components/categories/List.vue`, "utf8");
        expect(source).toContain("<SharedEntityAvatar");
        expect(source).toContain("isDesktop");
    });

    it("gives both categories avatars the shared fallback icon", () => {
        const source = readFileSync(`${appDir}/components/categories/List.vue`, "utf8");
        expect(source).not.toContain('fallback="tag"');
        expect(source.split(':fallback="DEFAULT_CATEGORY_AVATAR_ICON"').length - 1).toBe(2);
    });

    it("keeps the mobile category menu to the default Menu (the ⋮ never opens a system row)", () => {
        const source = readFileSync(`${appDir}/components/categories/List.vue`, "utf8");
        expect(source).not.toContain("item.tooltip");
        expect(source).not.toContain("#item");
    });

    it("gives the card payoff band the shared loading, error and empty props", () => {
        const source = readFileSync(`${appDir}/pages/settings/card-payoff-patterns.vue`, "utf8");
        expect(source).toContain(':loading="isLoading"');
        expect(source).toContain(':error="error"');
        expect(source).toContain(':empty="!patterns || patterns.length === 0"');
        expect(source).not.toContain("<ProgressSpinner");
        expect(source).not.toContain("<Message");
    });
});

describe("design contract: settings and transaction detail bands", () => {
    // Settings and the transaction detail are bands: a SharedSectionBand carries the chrome, and no Card or Panel draws a box.
    const BAND_PAGES = [
        "pages/settings/index.vue",
        "pages/transactions/[id].vue",
        "components/bankSync/PasskeysCard.vue",
        "components/settings/McpConnectionsCard.vue",
        "components/transactions/AttachmentsCard.vue",
    ];

    it.each(BAND_PAGES)("%s draws no <Card or <Panel", (rel) => {
        const source = readFileSync(`${appDir}/${rel}`, "utf8");
        expect(source).not.toContain("<Card");
        expect(source).not.toContain("<Panel");
    });

    it("gives the detail error banner the mobile gutter, since the page is fullBleed", () => {
        const source = readFileSync(`${appDir}/pages/transactions/[id].vue`, "utf8");
        const banner = source.slice(source.indexOf("<Message"), source.indexOf("Error loading transaction"));
        expect(banner).toContain('class="mx-4 md:mx-0"');
    });

    it("sends the settings rows to their pages by link, not by a primary button", () => {
        expect(readFileSync(`${appDir}/pages/settings/index.vue`, "utf8")).not.toContain("router.push('/categories')");
    });
});

describe("design contract: transaction rows", () => {
    // One row owns the 16px gutter, so Transactions, Overview Recent and Budget detail share it.
    it.each([
        "components/dashboard/RecentTransactions.vue",
        "components/transactions/ListRows.vue",
        "pages/budgets/[id]/index.vue",
    ])("renders %s through TransactionRow", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain("TransactionRow");
    });

    it.each([
        "components/transactions/List.vue",
        "components/transactions/ListCards.vue",
        "components/transactions/ListTable.vue",
    ])("deletes the legacy %s", (rel) => {
        expect(existsSync(`${appDir}/${rel}`)).toBe(false);
    });

    it("records the transaction row's own-gutter exception in DESIGN.md", () => {
        const design = readFileSync(`${appDir}/../DESIGN.md`, "utf8");
        expect(design).toContain("The exception is the transaction row");
        expect(design).toContain("**Transaction row**");
    });

    it("draws the budget detail bands with no nested card, panel or scoped style", () => {
        const source = readFileSync(`${appDir}/pages/budgets/[id]/index.vue`, "utf8");
        expect(source).not.toContain("<Card");
        expect(source).not.toContain("<Panel");
        expect(source).not.toContain("<style");
    });
});

describe("design contract: shared empty states", () => {
    // Every list or section empty state is the shared SharedEmptyState, or a band's empty-text prop that renders it.
    it.each([
        "components/dashboard/AccountsSection.vue",
        "components/dashboard/BudgetsSection.vue",
        "pages/budgets/index.vue",
        "pages/accounts/index.vue",
        "pages/bank-connections.vue",
        "pages/budgets/[id]/index.vue",
    ])("%s uses the shared empty state", (rel) => {
        const source = readFileSync(`${appDir}/${rel}`, "utf8");
        expect(source.includes("SharedEmptyState") || source.includes("empty-text")).toBe(true);
    });
});

describe("design contract: account rows", () => {
    // Overview and the Accounts page share one mobile row; the section must not redraw it.
    it("renders the Overview accounts section through AccountsAccountRow", () => {
        const source = readFileSync(`${appDir}/components/dashboard/AccountsSection.vue`, "utf8");
        expect(source).toContain("<AccountsAccountRow");
    });

    it("deletes the dashboard-only AccountRowMobile", () => {
        expect(existsSync(`${appDir}/components/dashboard/AccountRowMobile.vue`)).toBe(false);
    });
});

describe("design contract: accounts page", () => {
    // The page is a band of the shared row (mobile) and tile (desktop), with one ⋮ menu; no Card grid or hover-only actions.
    const source = readFileSync(`${appDir}/pages/accounts/index.vue`, "utf8");

    it("renders the accounts through AccountsAccountRow and DashboardAccountTile", () => {
        expect(source).toContain("<AccountsAccountRow");
        expect(source).toContain("<DashboardAccountTile");
    });

    it("draws no Card and carries no scoped style", () => {
        expect(source).not.toContain("<Card");
        expect(source).not.toContain("<style");
    });

    it("keeps the actions visible rather than revealed on hover", () => {
        expect(source).not.toContain("opacity: 0");
    });
});

describe("design contract: budget rows", () => {
    // Overview and the Budgets list share one row and one list; the section must not redraw either.
    it("renders the Overview budgets section through BudgetsBudgetList with no raw ProgressBar", () => {
        const source = readFileSync(`${appDir}/components/dashboard/BudgetsSection.vue`, "utf8");
        expect(source).toContain("<BudgetsBudgetList");
        expect(source).not.toContain("<ProgressBar");
    });

    it("draws each budget row's bar through BudgetsBudgetProgressBar", () => {
        expect(readFileSync(`${appDir}/components/budgets/BudgetRow.vue`, "utf8")).toContain(
            "<BudgetsBudgetProgressBar",
        );
    });
});

describe("design contract: avatars", () => {
    // Every category or account avatar renders through SharedEntityAvatar, so a blank or unregistered icon can't reappear.
    const AVATAR_SURFACES = [
        "components/transactions/TransactionRow.vue",
        "components/dashboard/AccountTile.vue",
        "components/accounts/AccountRow.vue",
        // The account form's avatar is the icon picker's trigger, which renders SharedEntityAvatar itself.
        "components/shared/IconPicker.vue",
    ];

    it.each(AVATAR_SURFACES)("renders %s through SharedEntityAvatar", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain("<SharedEntityAvatar");
    });

    it("renders the category select's pending, selected and option rows through SharedEntityAvatar", () => {
        const source = readFileSync(`${appDir}/components/categories/CategorySelect.vue`, "utf8");
        expect(source.split("<SharedEntityAvatar").length - 1).toBe(3);
        expect(source).not.toContain("w-4 h-4 rounded-full");
        expect(source).toContain(':fallback="DEFAULT_CATEGORY_AVATAR_ICON"');
    });

    it("leads the category chip with its icon by default", () => {
        const source = readFileSync(`${appDir}/components/shared/CategoryChip.vue`, "utf8");
        expect(source).toContain("showIcon: true");
        expect(source).toContain("resolveAvatarIcon(props.icon, DEFAULT_CATEGORY_AVATAR_ICON)");
    });

    it.each([
        ["components/transactions/TransactionRow.vue", 2],
        ["pages/transactions/[id].vue", 1],
    ])("opts %s out of the chip icon beside its category avatar (%i chips)", (rel, chips) => {
        const source = readFileSync(`${appDir}/${rel}`, "utf8");
        expect(source.split("<SharedCategoryChip").length - 1).toBe(chips);
        expect(source.split(':show-icon="false"').length - 1).toBe(chips);
    });

    it("customises a pending transaction category through the pencil and the deferred category dialog", () => {
        const source = readFileSync(`${appDir}/components/transactions/TransactionForm.vue`, "utf8");
        expect(source).toContain(':pending-icon="pendingCategory?.icon"');
        expect(source).toContain('aria-label="Customise new category"');
        expect(source).toContain("<CategoriesFormModal");
        expect(source).toMatch(/<CategoriesFormModal\s+v-model:visible="customiseOpen"\s+deferred/);
        expect(source).toContain(':pending="pendingCategory"');
        expect(source).toContain('@done="(v) => (pendingCategory = v)"');
    });

    it("holds the hosting transaction dialog's Escape while the deferred category dialog is open", () => {
        const form = readFileSync(`${appDir}/components/transactions/TransactionForm.vue`, "utf8");
        expect(form).toContain('watch(customiseOpen, (open) => emit("customiseOpenChange", open));');
        expect(form).toContain("customiseOpenChange: [open: boolean];");
        for (const rel of [
            "components/transactions/CreateTransactionDialog.vue",
            "components/transactions/EditTransactionDialog.vue",
        ]) {
            const dialog = readFileSync(`${appDir}/${rel}`, "utf8");
            expect(dialog).toContain("const customiseOpen = ref(false);");
            expect(dialog).toContain('@customise-open-change="customiseOpen = $event"');
            expect(dialog).toContain(':suspend-escape="customiseOpen"');
        }
    });

    it("builds no pi-<stored icon> class, which blanks the avatar", () => {
        const offenders = vueFiles(appDir).filter((rel) =>
            /pi-\$\{[^}]*\.icon/.test(readFileSync(`${appDir}/${rel}`, "utf8")),
        );
        expect(offenders).toEqual([]);
    });

    it("imports the Lucide package only from utils/avatarIcons.ts", () => {
        const LUCIDE_IMPORT = /from\s+["']@lucide\/vue["']/;
        const self = "layouts/designContract.test.ts";
        const importers = readdirSync(appDir, { recursive: true, encoding: "utf8" })
            .map(toPosix)
            .filter((rel) => /\.(ts|vue)$/.test(rel) && rel !== self)
            .filter((rel) => LUCIDE_IMPORT.test(readFileSync(`${appDir}/${rel}`, "utf8")));
        expect(importers).toEqual(["utils/avatarIcons.ts"]);
    });

    it("matches the stored-icon class bug and the Lucide import pattern", () => {
        expect(/pi-\$\{[^}]*\.icon/.test('class="pi pi-${category.icon}"')).toBe(true);
        expect(/pi-\$\{[^}]*\.icon/.test('<SharedEntityAvatar :icon="category.icon" />')).toBe(false);
        expect(/from\s+["']@lucide\/vue["']/.test(`import { Tag } from "@lucide/vue";`)).toBe(true);
    });
});

describe("design contract: dialogs and forms", () => {
    // A dialog title is a sentence: capitals only on the first word, or on all-caps acronyms (PIN, MCP).
    const isSentenceCase = (text: string) =>
        text
            .split(/\s+/)
            .slice(1)
            .every((word) => !/^[A-Z]/.test(word) || word === word.toUpperCase());

    const DIALOG_TAG = /<(?:Dialog|SharedFormDialog)\b[^>]*>/g;
    const dialogHeaders = (source: string) =>
        [...source.matchAll(DIALOG_TAG)].flatMap((tag) => {
            const staticHeader = tag[0].match(/\sheader="([^"]*)"/)?.[1];
            const boundHeader = tag[0].match(/:header="([^"]*)"/)?.[1] ?? "";
            const literals = [...boundHeader.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
            return staticHeader !== undefined ? [staticHeader] : literals;
        });
    const confirmHeaders = (source: string) => [...source.matchAll(/header:\s*"([^"]*)"/g)].map((m) => m[1]!);

    it("recognises a Title Case header as not sentence case", () => {
        expect(isSentenceCase("Delete Budget")).toBe(false);
        expect(isSentenceCase("Enter sync PIN")).toBe(true);
        expect(isSentenceCase("Mark as credit card payment")).toBe(true);
    });

    it("uses sentence-case titles on every Dialog, SharedFormDialog and confirm header", () => {
        const offenders = vueFiles(appDir).flatMap((rel) => {
            const source = readFileSync(`${appDir}/${rel}`, "utf8");
            return [...dialogHeaders(source), ...confirmHeaders(source)]
                .filter((header) => !isSentenceCase(header))
                .map((header) => `${rel}: "${header}" is not sentence case`);
        });
        expect(offenders).toEqual([]);
    });

    it("gives FormDialog the autofocus wrapper for initialFocus=dialog", () => {
        const source = readFileSync(`${appDir}/components/shared/FormDialog.vue`, "utf8");
        expect(source).toContain("autofocus");
        expect(source).toContain("tabindex");
    });

    it("focuses the amount on a new transaction and never on an edit (the attr must reach the input, not InputNumber's span)", () => {
        const source = readFileSync(`${appDir}/components/transactions/TransactionForm.vue`, "utf8");
        expect(source).toContain("pcInputText: { root: { autofocus: !isEdit } }");
    });

    const FORM_DIALOGS = [
        "components/transactions/CreateTransactionDialog.vue",
        "components/transactions/EditTransactionDialog.vue",
        "components/accounts/AccountsFormModal.vue",
        "components/categories/FormModal.vue",
        "components/bankSync/ScraperConnectionModal.vue",
        "components/budgets/BudgetFormDialog.vue",
    ];

    it.each(FORM_DIALOGS)("builds %s on SharedFormDialog", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain("<SharedFormDialog");
    });

    // DESIGN.md: an API error is the inline banner, not a toast, so the dialog shows it where the user is.
    it.each(FORM_DIALOGS)("shows %s API errors in the SharedFormDialog banner", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain(`:api-error="apiError"`);
    });
});

describe("design contract: budget create/edit dialog", () => {
    // The budget routes are gone: create and edit are a layout-level dialog, so no page or link may
    // target them. Test files are skipped so these patterns can be written out here.
    const sourceFiles = vueFiles(appDir).concat(
        readdirSync(appDir, { recursive: true, encoding: "utf8" })
            .map(toPosix)
            .filter((rel) => rel.endsWith(".ts") && !rel.endsWith(".test.ts")),
    );

    it("deletes the budget create and edit routes", () => {
        expect(existsSync(`${appDir}/pages/budgets/create.vue`)).toBe(false);
        expect(existsSync(`${appDir}/pages/budgets/[id]/edit.vue`)).toBe(false);
    });

    it("links to no budget create route or budget edit route", () => {
        const offenders = sourceFiles.filter((rel) => {
            const source = readFileSync(`${appDir}/${rel}`, "utf8");
            return source.includes("budgets/create") || /budgets\/\$\{[^}]+\}\/edit/.test(source);
        });
        expect(offenders).toEqual([]);
    });

    it.each([
        "pages/budgets/index.vue",
        "components/dashboard/BudgetsSection.vue",
        "pages/budgets/[id]/index.vue",
        "components/budgets/BudgetList.vue",
    ])("%s opens the dialog through useBudgetFormDialog", (rel) => {
        expect(readFileSync(`${appDir}/${rel}`, "utf8")).toContain("useBudgetFormDialog");
    });

    // A failed load leaves no budget and stops loading, so the edit spinner must yield to the error message.
    it("stops the edit spinner once the budget query has errored", () => {
        const source = readFileSync(`${appDir}/components/budgets/BudgetFormDialog.vue`, "utf8");
        expect(source).toContain("isEdit.value && !error.value && (isLoading.value || !budget.value)");
    });

    // A failed background refetch keeps the cached budget; the form must not be swapped for the error then.
    it("shows the load error only when no budget is cached", () => {
        const source = readFileSync(`${appDir}/components/budgets/BudgetFormDialog.vue`, "utf8");
        expect(source).toContain("isEdit.value && !!error.value && !budget.value");
    });
});

describe("savings accounts: counterpart picker and balance dialog", () => {
    const txForm = readFileSync(`${appDir}/components/transactions/TransactionForm.vue`, "utf8");
    const balanceDialog = readFileSync(`${appDir}/components/accounts/UpdateLedgerBalanceDialog.vue`, "utf8");

    it("only hides Create Cash when a cash account already exists in the needed currency", () => {
        expect(txForm).toContain('a.type === "cash" && a.currencyId === neededCurrencyId.value');
    });

    it("captions each counterpart option with its account type so cash and savings differ", () => {
        expect(txForm).toContain("accountTypeCaption(slotProps.option.type)");
        expect(txForm).toContain('tooltip="This account uses its own currency"');
    });

    it("takes the update-balance copy and prefill from the ledger helpers", () => {
        expect(balanceDialog).toContain('ledgerBalanceDialogCopy(isLedgerAccountType(type) ? type : "cash")');
        expect(balanceDialog).toContain("ledgerBalancePrefill(props.account)");
        expect(balanceDialog).toContain(':header="copy.header"');
        expect(balanceDialog).toContain("copy.value.successSummary");
        expect(balanceDialog).toContain("copy.value.errorFallback");
    });
});

describe("savings accounts: web wiring", () => {
    // Savings is a ledger type like cash: form, menu and row/tile Update all key off isLedgerAccountType.
    const formModal = readFileSync(`${appDir}/components/accounts/AccountsFormModal.vue`, "utf8");
    const accountsPage = readFileSync(`${appDir}/pages/accounts/index.vue`, "utf8");
    const tile = readFileSync(`${appDir}/components/dashboard/AccountTile.vue`, "utf8");
    const row = readFileSync(`${appDir}/components/accounts/AccountRow.vue`, "utf8");

    it("offers Savings in the account form and requires a currency for it", () => {
        expect(formModal).toContain('{ label: "Savings", value: "savings" }');
        expect(formModal).toContain("isLedgerAccountType(accountType.value)");
        expect(formModal).toContain("Cash and savings accounts need a currency");
    });

    it("blocks deleting a ledger account with linked transfers and offers Update balance for it", () => {
        expect(accountsPage).toContain("isLedgerAccountType(account.type) && account.hasLinkedTransfers");
        expect(accountsPage).toContain("...(isLedgerAccountType(account.type)");
    });

    it("shows the Update action on the tile and row for ledger accounts", () => {
        expect(tile).toContain('v-if="isLedgerAccountType(account.type) && !manageable"');
        expect(row).toContain('v-if="isLedgerAccountType(account.type) && !manageable"');
    });
});
