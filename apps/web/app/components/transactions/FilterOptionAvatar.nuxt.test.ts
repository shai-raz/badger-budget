import { describe, expect, it } from "vitest";
import type { TransactionType } from "@badger/shared-data";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import FilterOptionAvatar from "./FilterOptionAvatar.vue";
import EntityAvatar from "~/components/shared/EntityAvatar.vue";
import { TRANSACTION_TYPE_AVATARS } from "~/utils/avatarIcons";

describe("FilterOptionAvatar", () => {
    it("draws a type option as a glyph in the income amount colour", async () => {
        const wrapper = await mountSuspended(FilterOptionAvatar, {
            props: { avatar: { kind: "type", type: "income" } },
        });

        expect(wrapper.find("svg").exists()).toBe(true);
        expect(wrapper.html()).toContain("var(--p-amount-income)");
    });

    it("draws an entity option with its own colour", async () => {
        const wrapper = await mountSuspended(FilterOptionAvatar, {
            props: { avatar: { kind: "entity", icon: "coffee", color: "#10B981", fallback: "tag" } },
        });

        expect(wrapper.find("svg").exists()).toBe(true);
        expect(wrapper.html()).toContain("#10b981");
    });

    it("draws the fallback glyph when an entity has no icon", async () => {
        const fallback = await mountSuspended(FilterOptionAvatar, {
            props: { avatar: { kind: "entity", icon: null, color: null, fallback: "coffee" } },
        });
        const stored = await mountSuspended(FilterOptionAvatar, {
            props: { avatar: { kind: "entity", icon: "coffee", color: null, fallback: "tag" } },
        });

        expect(fallback.find("svg").exists()).toBe(true);
        expect(fallback.html()).toBe(stored.html());
    });
});

describe("FilterOptionAvatar type options", () => {
    it.each<TransactionType>(["income", "expense", "transfer"])(
        "draws %s through SharedEntityAvatar in its token colour",
        async (type) => {
            const wrapper = await mountSuspended(FilterOptionAvatar, {
                props: { avatar: { kind: "type", type } },
            });

            expect(wrapper.findComponent(EntityAvatar).exists()).toBe(true);
            // The 14% wash is a color-mix() that happy-dom drops, so only the text colour the glyph draws in is asserted.
            expect(wrapper.find("div").attributes("style")).toContain(`color: ${TRANSACTION_TYPE_AVATARS[type].color}`);
            expect(wrapper.find("svg").attributes("stroke")).toBe("currentColor");
        },
    );
});
