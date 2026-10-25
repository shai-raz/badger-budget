import { describe, expect, it } from "vitest";
import {
    BOTTOM_BAR_ITEMS,
    DRAWER_ITEMS,
    NAV_ACTIONS,
    SIDEBAR_BOTTOM_ITEMS,
    SIDEBAR_ITEMS,
    isActiveRoute,
    type NavAction,
    type NavItem,
} from "./navigation";

const labels = (items: readonly NavItem[]) => items.map((item) => item.label);

const ALL_ITEMS = [...SIDEBAR_ITEMS, ...SIDEBAR_BOTTOM_ITEMS, ...BOTTOM_BAR_ITEMS, ...DRAWER_ITEMS];

describe("navigation config", () => {
    it("lists sidebar items in order", () => {
        expect(labels(SIDEBAR_ITEMS)).toEqual([
            "Overview",
            "Transactions",
            "Budgets",
            "Accounts",
            "Bank connections",
            "Reports",
        ]);
        expect(SIDEBAR_ITEMS[0]).toEqual({ label: "Overview", icon: "pi pi-home", to: "/" });
    });

    it("lists sidebar bottom items in order", () => {
        expect(labels(SIDEBAR_BOTTOM_ITEMS)).toEqual(["Settings"]);
    });

    it("lists bottom bar items in order", () => {
        expect(labels(BOTTOM_BAR_ITEMS)).toEqual(["Overview", "Transactions", "Budgets", "Reports"]);
    });

    it("keeps bank connections and accounts out of the bottom bar", () => {
        expect(BOTTOM_BAR_ITEMS.map((item) => item.to)).not.toContain("/bank-connections");
        expect(BOTTOM_BAR_ITEMS.map((item) => item.to)).not.toContain("/accounts");
    });

    it("lists drawer items in order, with accounts first", () => {
        expect(labels(DRAWER_ITEMS)).toEqual(["Accounts", "Bank connections", "Categories", "Settings"]);
    });

    it("keeps the desktop sidebar order unchanged", () => {
        expect(labels(SIDEBAR_ITEMS)).toContain("Accounts");
        expect(SIDEBAR_ITEMS.map((item) => item.to)).toEqual([
            "/",
            "/transactions",
            "/budgets",
            "/accounts",
            "/bank-connections",
            "/reports",
        ]);
    });

    it("never uses the retired Dashboard or Activity labels", () => {
        for (const item of ALL_ITEMS) {
            expect(item.label).not.toBe("Dashboard");
            expect(item.label).not.toBe("Activity");
        }
    });

    it("reuses the same icon and path for a page across every list", () => {
        const byTo = new Map<string, NavItem>();
        for (const item of ALL_ITEMS) {
            const seen = byTo.get(item.to);
            if (seen) {
                expect(item).toEqual(seen);
            } else {
                byTo.set(item.to, item);
            }
        }
    });
});

describe("navigation actions", () => {
    const actions: readonly NavAction[] = Object.values(NAV_ACTIONS);

    it("has unique ids, labels and icons", () => {
        expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
        expect(new Set(actions.map((action) => action.label)).size).toBe(actions.length);
        expect(new Set(actions.map((action) => action.icon)).size).toBe(actions.length);
    });

    it("does not reuse a route item icon", () => {
        const routeIcons = new Set(ALL_ITEMS.map((item) => item.icon));
        for (const action of actions) {
            expect(routeIcons.has(action.icon)).toBe(false);
        }
    });

    it("stays out of every route list", () => {
        const routeLabels = new Set(ALL_ITEMS.map((item) => item.label));
        for (const action of actions) {
            expect(routeLabels.has(action.label)).toBe(false);
        }
    });
});

describe("isActiveRoute", () => {
    it("only marks the overview active on the exact root path", () => {
        expect(isActiveRoute("/", "/")).toBe(true);
        expect(isActiveRoute("/transactions", "/")).toBe(false);
    });

    it("marks a route active for nested paths", () => {
        expect(isActiveRoute("/settings/card-payoff-patterns", "/settings")).toBe(true);
        expect(isActiveRoute("/budgets/abc/history", "/budgets")).toBe(true);
    });

    it("matches whole path segments only", () => {
        expect(isActiveRoute("/budgetsx", "/budgets")).toBe(false);
    });

    it("matches the exact path", () => {
        expect(isActiveRoute("/budgets", "/budgets")).toBe(true);
    });
});
