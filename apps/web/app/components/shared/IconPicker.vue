<script setup lang="ts">
/**
 * The icon picker for a category or account: a round avatar trigger with a pencil badge that opens a
 * searchable popover of every registry icon, grouped. Escape stops its event so a hosting dialog stays
 * open. Presentational only: the parent owns the value.
 */
import type { AvatarIconName } from "@badger/shared-data";
import { AVATAR_ICON_META } from "@badger/shared-data";
import { filterIconGroups, ICON_PICKER_COLUMNS, layoutIconGrid, moveGridFocus, type GridKey } from "~/utils/iconPicker";

interface DefaultTile {
    icon: AvatarIconName;
    label: string;
}

interface Props {
    color?: string | null;
    fallback: AvatarIconName;
    defaultTile?: DefaultTile;
    triggerId?: string;
    ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    color: null,
    defaultTile: undefined,
    triggerId: undefined,
    ariaLabel: "Choose icon",
});

const modelValue = defineModel<AvatarIconName | null>({ default: null });

const GRID_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
function isGridKey(key: string): key is GridKey {
    return GRID_KEYS.includes(key);
}

const query = ref("");
const open = ref(false);
const popover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const defaultTileEl = ref<HTMLButtonElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);

const searching = computed(() => query.value.trim().length > 0);
const groups = computed(() => filterIconGroups(query.value));
const cells = computed(() => layoutIconGrid(groups.value, ICON_PICKER_COLUMNS));
const cellIndex = computed(() => new Map(cells.value.map((cell, index) => [cell.name, index])));
const showDefault = computed(() => props.defaultTile !== undefined && !searching.value);

/** Grid tiles in DOM order, which matches `cells` (the default tile is not a grid tile). */
function gridTiles(): HTMLElement[] {
    return Array.from(scrollEl.value?.querySelectorAll<HTMLElement>("[data-icon-cell]") ?? []);
}

function focusTile(index: number) {
    gridTiles()[index]?.focus();
}

function focusDefaultTile(): boolean {
    if (!showDefault.value || !defaultTileEl.value) return false;
    defaultTileEl.value.focus();
    return true;
}

/** ArrowDown from the search field: the selected tile, else the default tile, else the first tile. */
function focusFromSearch(event: KeyboardEvent) {
    event.preventDefault();
    const selected = cells.value.findIndex((cell) => cell.name === modelValue.value);
    if (showDefault.value && modelValue.value === null && focusDefaultTile()) return;
    if (selected >= 0) return focusTile(selected);
    if (focusDefaultTile()) return;
    focusTile(0);
}

function onTileKeydown(event: KeyboardEvent, index: number) {
    if (!isGridKey(event.key)) return;
    event.preventDefault();
    const next = moveGridFocus(cells.value, index, event.key);
    if (event.key === "ArrowUp" && next === index && cells.value[index]?.row === 0 && focusDefaultTile()) return;
    focusTile(next);
}

function onDefaultTileKeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusTile(0);
}

function toggle(event: Event) {
    popover.value?.toggle(event);
}

function onHide() {
    open.value = false;
    query.value = "";
    // A close from outside the popover (a click on its non-focusable parts, or PrimeVue's own Escape) can leave focus on
    // <body>, where the next Escape reaches no handler. Hand focus back to the trigger, which sits inside the hosting mask.
    const active = document.activeElement;
    if (!active || active === document.body || panelEl.value?.contains(active)) triggerEl.value?.focus();
}

function pick(name: AvatarIconName | null) {
    modelValue.value = name;
    popover.value?.hide();
    triggerEl.value?.focus();
}

function onEscape(event: KeyboardEvent) {
    event.stopPropagation();
    event.preventDefault();
    popover.value?.hide();
    triggerEl.value?.focus();
}

const TILE_CLASS =
    "flex h-9 w-full items-center justify-center rounded-lg outline-none hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-surface-800";
const SELECTED_CLASS = "ring-2 ring-primary";
</script>

<template>
    <div>
        <button
            :id="triggerId"
            ref="triggerEl"
            type="button"
            class="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :aria-label="ariaLabel"
            aria-haspopup="dialog"
            :aria-expanded="open"
            @click="toggle"
        >
            <SharedEntityAvatar
                size="lg"
                :icon="modelValue"
                :color="color"
                :fallback="fallback"
            />
            <span
                class="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface-100 text-xs text-muted-color ring-2 ring-surface-0 transition-colors group-hover:text-color group-focus-visible:text-color dark:bg-surface-700 dark:ring-surface-900"
                aria-hidden="true"
            >
                <i class="pi pi-pencil !text-xs"></i>
            </span>
        </button>

        <Popover
            ref="popover"
            @show="open = true"
            @hide="onHide"
        >
            <div
                ref="panelEl"
                class="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
                @keydown.esc="onEscape"
            >
                <InputText
                    v-model="query"
                    autofocus
                    placeholder="Search icons"
                    aria-label="Search icons"
                    class="w-full"
                    @keydown.down="focusFromSearch"
                />

                <div
                    ref="scrollEl"
                    class="max-h-[min(60vh,22rem)] overflow-y-auto"
                >
                    <button
                        v-if="showDefault && defaultTile"
                        ref="defaultTileEl"
                        type="button"
                        class="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-surface-800"
                        :class="modelValue === null && SELECTED_CLASS"
                        :aria-pressed="modelValue === null"
                        @click="pick(null)"
                        @keydown="onDefaultTileKeydown"
                    >
                        <SharedEntityAvatar
                            size="sm"
                            :icon="defaultTile.icon"
                            :color="color"
                            :fallback="defaultTile.icon"
                        />
                        <span>{{ defaultTile.label }}</span>
                    </button>

                    <section
                        v-for="group in groups"
                        :key="group.id"
                        class="mb-2 last:mb-0"
                    >
                        <h3 class="mb-1 text-xs text-muted-color">{{ group.label }}</h3>
                        <div class="grid grid-cols-6 gap-1">
                            <button
                                v-for="name in group.icons"
                                :key="name"
                                type="button"
                                :class="[TILE_CLASS, modelValue === name && SELECTED_CLASS]"
                                :data-icon-cell="cellIndex.get(name)"
                                :aria-label="AVATAR_ICON_META[name].label"
                                :aria-pressed="modelValue === name"
                                @click="pick(name)"
                                @keydown="onTileKeydown($event, cellIndex.get(name) ?? 0)"
                            >
                                <SharedEntityAvatar
                                    size="sm"
                                    :icon="name"
                                    :color="color"
                                    :fallback="fallback"
                                />
                            </button>
                        </div>
                    </section>

                    <p
                        v-if="searching && cells.length === 0"
                        class="py-6 text-center text-sm text-muted-color"
                    >
                        No icons match "{{ query.trim() }}"
                    </p>
                </div>
            </div>
        </Popover>
    </div>
</template>
