<script setup lang="ts">
import type { MenuItem } from "primevue/menuitem";
import type { MenuPassThroughMethodOptions } from "primevue/menu";
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";

const sortOption = defineModel<TransactionSortOption>({ default: "newest" });

// Record (not an array literal) so adding a TransactionSortOption member
// without wiring it in here is a compile error, not a silently-mislabelled
// trigger — mirrors the SORT_MAP pattern in useTransactionFilters.ts.
const SORT_LABELS: Record<TransactionSortOption, { label: string; short: string }> = {
    newest: { label: "Newest first", short: "Newest" },
    oldest: { label: "Oldest first", short: "Oldest" },
    "amount-desc": { label: "Highest amount", short: "Highest" },
    "amount-asc": { label: "Lowest amount", short: "Lowest" },
    name: { label: "Name (A–Z)", short: "Name" },
};

// String-keyed object literals iterate in insertion order, so this keeps the
// display order (newest, oldest, amount-desc, amount-asc, name).
const SORT_OPTIONS = Object.entries(SORT_LABELS).map(([value, copy]) => ({
    value: value as TransactionSortOption,
    ...copy,
}));

const shortLabel = computed(() => SORT_LABELS[sortOption.value].short);

/** PrimeVue's MenuItem plus the sort value each leaf item carries, so the
 * active option can be identified in the #item slot without an `any` cast. */
interface SortMenuItem extends MenuItem {
    value: TransactionSortOption;
}

const items = computed<MenuItem[]>(() => [
    {
        label: "Sort by",
        items: SORT_OPTIONS.map(
            (option): SortMenuItem => ({
                label: option.label,
                value: option.value,
                command: () => {
                    sortOption.value = option.value;
                },
            }),
        ),
    },
]);

function isSelected(item: MenuItem) {
    return (item as SortMenuItem).value === sortOption.value;
}

/**
 * Conveys the active option to assistive tech via `aria-current` on the real
 * `role="menuitem"` element. A visually-hidden marker inside the #item slot
 * would NOT work here: PrimeVue's Menuitem hardcodes `aria-label` on that same
 * `<li>` from the item's plain label, which fully overrides the accessible
 * name computed from its (our) descendant content — the checkmark icon and
 * any sr-only text inside it are invisible to AT regardless of markup.
 * `aria-current` is a separate state, not part of the name, so it survives.
 */
const itemPt = computed(() => ({
    item: (options: MenuPassThroughMethodOptions) =>
        isSelected(options.context.item) ? { "aria-current": "true" } : {},
}));

const menu = ref<{ toggle: (event: Event) => void } | null>(null);
const open = ref(false);

function toggle(event: Event) {
    menu.value?.toggle(event);
}
</script>

<template>
    <div>
        <!-- A real Button so the theme supplies hover, focus-visible and a
             themed minimum tap target (the old hand-rolled <button> had none
             of those). Visible "Sort · <value>" text is left as the
             accessible name instead of an aria-label, since aria-label would
             replace rather than augment it and hide the current sort value
             from screen readers. -->
        <Button
            type="button"
            text
            severity="secondary"
            size="small"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click="toggle"
        >
            <i class="pi pi-sort-alt text-xs"></i>
            <span class="text-sm">Sort &middot; {{ shortLabel }}</span>
            <i
                class="pi text-xs"
                :class="open ? 'pi-chevron-up' : 'pi-chevron-down'"
            ></i>
        </Button>

        <!-- No custom group-label slot: the "Sort by" group renders with Menu's
             own themed submenu-label styling by default (PrimeVue's MenuSlots
             type only declares the deprecated `submenuheader` name even though
             `submenulabel` works at runtime, so templating it here would need
             an unsound cast — the default rendering is themed already, so
             there's nothing to gain from overriding it). -->
        <Menu
            ref="menu"
            :model="items"
            :pt="itemPt"
            popup
            @show="open = true"
            @hide="open = false"
        >
            <template #item="{ item, props }">
                <a
                    v-bind="props.action"
                    class="flex w-full items-center justify-between gap-3"
                >
                    <span
                        class="text-sm"
                        :class="isSelected(item) ? 'font-bold' : 'font-normal'"
                        >{{ item.label }}</span
                    >
                    <!-- Decorative only — aria-current on the li (via :pt above)
                         is what actually reaches assistive tech. -->
                    <i
                        v-if="isSelected(item)"
                        class="pi pi-check text-primary"
                        aria-hidden="true"
                    ></i>
                </a>
            </template>
        </Menu>
    </div>
</template>
