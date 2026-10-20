export interface NavItem {
    label: string;
    icon: string;
    to: string;
}

/** Single source for every nav entry, so labels and icons cannot drift between sidebar, bottom bar and drawer. */
const NAV = {
    overview: { label: "Overview", icon: "pi pi-home", to: "/" },
    transactions: { label: "Transactions", icon: "pi pi-money-bill", to: "/transactions" },
    budgets: { label: "Budgets", icon: "pi pi-wallet", to: "/budgets" },
    accounts: { label: "Accounts", icon: "pi pi-credit-card", to: "/accounts" },
    bankConnections: { label: "Bank connections", icon: "pi pi-link", to: "/bank-connections" },
    reports: { label: "Reports", icon: "pi pi-chart-line", to: "/reports" },
    categories: { label: "Categories", icon: "pi pi-tags", to: "/categories" },
    settings: { label: "Settings", icon: "pi pi-cog", to: "/settings" },
} as const satisfies Record<string, NavItem>;

export const SIDEBAR_ITEMS: readonly NavItem[] = [
    NAV.overview,
    NAV.transactions,
    NAV.budgets,
    NAV.accounts,
    NAV.bankConnections,
    NAV.reports,
];

/** Logout is a button rather than a link, so it is rendered separately by the sidebar. */
export const SIDEBAR_BOTTOM_ITEMS: readonly NavItem[] = [NAV.settings];

export const BOTTOM_BAR_ITEMS: readonly NavItem[] = [NAV.overview, NAV.transactions, NAV.budgets, NAV.reports];

export const DRAWER_ITEMS: readonly NavItem[] = [NAV.accounts, NAV.bankConnections, NAV.categories, NAV.settings];

export function isActiveRoute(currentPath: string, to: string): boolean {
    if (to === "/") return currentPath === "/";
    return currentPath === to || currentPath.startsWith(`${to}/`);
}

/** Copied from the AppSidebar linkClass. */
export const NAV_LINK_CLASS =
    "flex items-center gap-2 px-3 py-2 mx-1 my-0.5 text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors duration-150 cursor-pointer";
export const NAV_ACTIVE_LINK_CLASS = "bg-surface-100 dark:bg-surface-800 font-medium";
