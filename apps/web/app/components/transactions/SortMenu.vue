<script setup lang="ts">
import type { MenuItem } from "primevue/menuitem";
import type { MenuPassThroughMethodOptions } from "primevue/menu";
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";

const sortProps = defineProps<{
    /** Shows only the short sort value and names the trigger explicitly, for narrow rows. */
    compact?: boolean;
}>();

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

const triggerText = computed(() => (sortProps.compact ? shortLabel.value : `Sort · ${shortLabel.value}`));

// Compact drops the "Sort ·" prefix, so the trigger's name must carry it back. The visible value stays inside the
// name ("Sort: Newest first" contains "Newest"), so speech input still matches what is on screen.
const triggerAriaLabel = computed(() =>
    sortProps.compact ? `Sort: ${SORT_LABELS[sortOption.value].label}` : undefined,
);

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

// Below md the options open in a bottom sheet rather than the popup Menu: a popup is too small a target on a phone.
const isDesktop = useIsDesktop();

const menu = ref<{ toggle: (event: Event) => void } | null>(null);
const open = ref(false);
const sheetOpen = ref(false);
const triggerEl = ref<{ $el: HTMLElement } | null>(null);
const expanded = computed(() => (isDesktop.value ? open.value : sheetOpen.value));

function toggle(event: Event) {
    if (isDesktop.value) menu.value?.toggle(event);
    else sheetOpen.value = true;
}

// Picking an option sets the sort and closes the sheet, as the popup Menu closes on a pick.
function pick(value: TransactionSortOption) {
    sortOption.value = value;
    sheetOpen.value = false;
}

// The sheet has no focus return of its own, so hand focus back to the trigger however it closed.
watch(sheetOpen, (isOpen, wasOpen) => {
    if (wasOpen && !isOpen) nextTick(() => triggerEl.value?.$el.focus());
});

// Crossing md with the sheet open would leave its modal mask over the desktop layout, so close it.
watch(isDesktop, () => {
    sheetOpen.value = false;
});
</script>

<template>
    <div>
        <!-- A real Button so the theme supplies hover, focus-visible and a
             themed minimum tap target (the old hand-rolled <button> had none
             of those). Normally the visible "Sort · <value>" text is the
             accessible name, so no aria-label: one would replace that text
             and hide the current sort value from screen readers. Compact
             drops the prefix, so it sets an aria-label that restores it. -->
        <Button
            ref="triggerEl"
            type="button"
            text
            severity="secondary"
            size="small"
            :aria-haspopup="isDesktop ? 'menu' : 'dialog'"
            :aria-label="triggerAriaLabel"
            :aria-expanded="expanded"
            @click="toggle"
        >
            <i class="pi pi-sort-alt text-xs"></i>
            <span class="text-sm">{{ triggerText }}</span>
            <i
                class="pi text-xs"
                :class="expanded ? 'pi-chevron-up' : 'pi-chevron-down'"
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

        <!-- Below md: the same options as radio rows. Mounted at every width, shown only below md. -->
        <SharedBottomSheet
            v-model:visible="sheetOpen"
            title="Sort by"
        >
            <div
                role="radiogroup"
                aria-label="Sort by"
                class="flex flex-col"
            >
                <button
                    v-for="option in SORT_OPTIONS"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="option.value === sortOption"
                    class="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm text-surface-900 hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-surface-0 dark:hover:bg-surface-800"
                    :class="option.value === sortOption ? 'font-bold' : 'font-normal'"
                    @click="pick(option.value)"
                >
                    <span>{{ option.label }}</span>
                    <i
                        v-if="option.value === sortOption"
                        class="pi pi-check text-primary"
                        aria-hidden="true"
                    ></i>
                </button>
            </div>

            <template #footer>
                <Button
                    label="Done"
                    class="w-full"
                    @click="sheetOpen = false"
                />
            </template>
        </SharedBottomSheet>
    </div>
</template>
