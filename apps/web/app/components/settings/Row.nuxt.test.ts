import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import Row from "./Row.vue";

describe("SettingsRow", () => {
    it("renders an internal route as a link with the title and subtitle", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Categories", icon: "pi pi-tags", to: "/settings/categories", subtitle: "12 categories" },
        });

        const link = wrapper.find("a[href='/settings/categories']");
        expect(link.exists()).toBe(true);
        expect(link.text()).toContain("Categories");
        expect(link.text()).toContain("12 categories");
        expect(wrapper.find(".pi-chevron-right").exists()).toBe(true);
    });

    it("renders a Skeleton and no subtitle while loading", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Accounts", icon: "pi pi-wallet", to: "/accounts", subtitle: "3 accounts", loading: true },
        });

        expect(wrapper.find(".p-skeleton").exists()).toBe(true);
        expect(wrapper.text()).not.toContain("3 accounts");
        expect(wrapper.find("span.text-xs").exists()).toBe(false);
    });

    it("renders no subtitle element for a null subtitle", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Rules", icon: "pi pi-bolt", to: "/rules", subtitle: null },
        });

        expect(wrapper.find("span.text-xs").exists()).toBe(false);
    });

    it("renders the tag text", async () => {
        const wrapper = await mountSuspended(Row, {
            props: {
                title: "Bank sync",
                icon: "pi pi-sync",
                to: "/settings/bank-sync",
                tag: { value: "Needs attention", tone: "warn" },
            },
        });

        expect(wrapper.text()).toContain("Needs attention");
    });

    it("renders the primary dot only when dot is true", async () => {
        const withDot = await mountSuspended(Row, {
            props: { title: "Updates", icon: "pi pi-download", to: "/settings/about", dot: true },
        });
        const withoutDot = await mountSuspended(Row, {
            props: { title: "Updates", icon: "pi pi-download", to: "/settings/about", dot: false },
        });

        expect(withDot.find("span.rounded-full.bg-primary").exists()).toBe(true);
        expect(withoutDot.find("span.rounded-full.bg-primary").exists()).toBe(false);
    });

    it("opens an external URL in a new tab with the arrow and a screen-reader hint", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Source code", icon: "pi pi-github", href: "https://example.com/repo" },
        });

        const link = wrapper.find("a[href='https://example.com/repo']");
        expect(link.attributes("target")).toBe("_blank");
        expect(link.attributes("rel")).toBe("noopener");
        expect(link.find(".pi-arrow-up-right").exists()).toBe(true);
        expect(link.text()).toContain("(opens in a new tab)");
    });

    it("renders a button that emits click in button mode", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Check for updates", icon: "pi pi-refresh" },
        });

        const button = wrapper.find("button");
        expect(button.attributes("type")).toBe("button");
        await button.trigger("click");

        expect(wrapper.emitted("click")).toHaveLength(1);
    });

    it("hides the chevron for a danger row", async () => {
        const wrapper = await mountSuspended(Row, {
            props: { title: "Log out", icon: "pi pi-sign-out", danger: true },
        });

        expect(wrapper.find(".pi-chevron-right").exists()).toBe(false);
        expect(wrapper.find(".text-red-500").exists()).toBe(true);
    });
});
