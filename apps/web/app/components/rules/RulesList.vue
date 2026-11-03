<script setup lang="ts">
/**
 * The "Your rules" band: search, the rule rows and reordering. Desktop rows drag by their grip, or move
 * from the keyboard, and each drop saves. Below md, reorder mode moves rows locally and saves once, on
 * Done. The page owns the toggle and the ⋮ menu; this list only reports them.
 */
import type { IRule } from "@badger/types";
import { moveArrayElement, useSortable } from "@vueuse/integrations/useSortable";
import { useToast } from "primevue/usetoast";
import { getApiErrorMessage } from "~/utils/apiError";
import {
    canMoveDown,
    canMoveUp,
    keyboardReorder,
    moveItem,
    sameOrder,
    type KeyboardReorderKey,
} from "~/utils/ruleReorder";
import { ruleMatchesSearch, type RuleDisplayContext } from "~/utils/ruleSentence";
import RuleRow from "./RuleRow.vue";

const props = defineProps<{
    rules: IRule[] | undefined;
    context: RuleDisplayContext;
    loading?: boolean;
    error?: unknown;
}>();

const emit = defineEmits<{
    toggle: [rule: IRule, isActive: boolean];
    actions: [event: Event, rule: IRule];
    edit: [rule: IRule];
    create: [];
}>();

/** True while the phone reorder mode is open. The page reads it to hide its header "+". */
const reorderMode = defineModel<boolean>("reorderMode", { default: false });

const isDesktop = useIsDesktop();
const toast = useToast();
const { mutate: reorder, isPending: isSaving } = useReorderRulesMutation();

const query = ref("");
const trimmedQuery = computed(() => query.value.trim());
const savedIds = computed(() => (props.rules ?? []).map((rule) => rule.id));
const rulesById = computed(() => new Map((props.rules ?? []).map((rule) => [rule.id, rule])));

// The order on screen. It follows the saved order except while a drag, keyboard pick or reorder mode is open.
const orderedIds = ref<string[]>([]);
const orderedRules = computed(() =>
    orderedIds.value.flatMap((id) => {
        const rule = rulesById.value.get(id);
        return rule ? [rule] : [];
    }),
);
const visibleRules = computed(() =>
    orderedRules.value.filter((rule) => ruleMatchesSearch(rule, query.value, props.context)),
);
const phoneReordering = computed(() => reorderMode.value && !isDesktop.value);
const dragEnabled = computed(() => phoneReordering.value || (isDesktop.value && trimmedQuery.value === ""));
const canStartReorder = computed(() => !isDesktop.value && trimmedQuery.value === "" && savedIds.value.length >= 2);
const meta = computed(() => {
    if (!props.rules) return undefined;
    const count = props.rules.length;
    return `${count} ${count === 1 ? "rule" : "rules"}`;
});
const isEmpty = computed(() => !!props.rules && props.rules.length === 0);

const runOrderTooltip = "Rules run top to bottom on each new <b>synced</b> transaction.";
const announcement = ref("");
const gripId = (id: string) => `rule-grip-${id}`;
const focusGrip = (id: string) => {
    nextTick(() => document.getElementById(gripId(id))?.focus());
};

const reportSaveError = (error: unknown) => {
    toast.add({
        severity: "error",
        summary: "Error",
        detail: getApiErrorMessage(error, "Couldn't save the new order."),
        life: 5000,
    });
};

// Keyboard pick state. `keyboardPicked` is the index of the row being moved; `keyboardOriginal` is the order Escape restores.
const keyboardPicked = ref<number | null>(null);
const keyboardOriginal = ref<string[] | null>(null);

watch(
    savedIds,
    (ids) => {
        if (!reorderMode.value && keyboardPicked.value === null) orderedIds.value = [...ids];
    },
    { immediate: true },
);

// Ends a keyboard pick without saving. The order goes back to the saved one, which may have changed mid-pick.
const cancelKeyboardPick = () => {
    if (keyboardPicked.value === null) return;
    keyboardPicked.value = null;
    keyboardOriginal.value = null;
    orderedIds.value = [...savedIds.value];
};

// Moving the picked row re-inserts its grip, which can blur it mid-move. The grip is refocused on the next tick,
// so the focus check waits a task.
const onGripFocusout = (id: string) => {
    setTimeout(() => {
        if (document.activeElement?.id !== gripId(id)) cancelKeyboardPick();
    });
};

const KEYBOARD_KEYS: Record<string, KeyboardReorderKey> = {
    " ": "Space",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    Escape: "Escape",
};

const onGripKeydown = (event: KeyboardEvent, rule: IRule) => {
    const key = KEYBOARD_KEYS[event.key];
    if (!key || phoneReordering.value || trimmedQuery.value !== "") return;
    event.preventDefault();

    const wasPicked = keyboardPicked.value !== null;
    const result = keyboardReorder(
        { ids: [...orderedIds.value], picked: keyboardPicked.value, original: keyboardOriginal.value },
        key,
        orderedIds.value.indexOf(rule.id),
    );
    orderedIds.value = result.state.ids;
    keyboardPicked.value = result.state.picked;
    keyboardOriginal.value = result.state.original;

    const position = orderedIds.value.indexOf(rule.id) + 1;
    const total = orderedIds.value.length;
    if (!wasPicked && result.state.picked !== null) {
        announcement.value = `Picked up at position ${position} of ${total}.`;
    } else if (wasPicked && result.state.picked === null) {
        announcement.value = result.commit ? `Dropped at position ${position} of ${total}.` : "Move cancelled.";
    } else if (result.state.picked !== null) {
        announcement.value = `Moved to position ${position} of ${total}`;
    }
    if (result.commit) reorder(result.commit, { onError: reportSaveError });
    focusGrip(rule.id);
};

const moveRow = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= orderedIds.value.length) return;
    orderedIds.value = moveItem(orderedIds.value, index, target);
    announcement.value = `Moved to position ${target + 1} of ${orderedIds.value.length}`;
    const movedId = orderedIds.value[target];
    if (movedId) focusGrip(movedId);
};

// VueUse only starts Sortable on mount, and the list is not rendered while loading, empty or searching,
// so restart it whenever the list element changes.
const listEl = ref<HTMLElement | null>(null);
const sortable = useSortable(listEl, orderedIds, {
    handle: ".rule-grip",
    animation: 150,
    onStart: cancelKeyboardPick,
    onUpdate: (event) => {
        const { oldIndex, newIndex } = event;
        if (oldIndex === undefined || newIndex === undefined) return;
        moveArrayElement(orderedIds, oldIndex, newIndex, event);
        // moveArrayElement applies the move on the next tick, so save after it.
        nextTick(() => {
            if (!phoneReordering.value && !sameOrder(orderedIds.value, savedIds.value)) {
                reorder([...orderedIds.value], { onError: reportSaveError });
            }
        });
    },
});

watch(dragEnabled, (enabled) => sortable.option("disabled", !enabled));
watch(
    listEl,
    (el) => {
        sortable.stop();
        if (!el) return;
        sortable.start();
        sortable.option("disabled", !dragEnabled.value);
    },
    { flush: "post" },
);

const enterReorder = () => {
    orderedIds.value = [...savedIds.value];
    reorderMode.value = true;
};

const cancelReorder = () => {
    reorderMode.value = false;
    orderedIds.value = [...savedIds.value];
};

// Done saves the whole order in one request. On failure the mode stays open with the new order.
const finishReorder = () => {
    if (sameOrder(orderedIds.value, savedIds.value)) {
        reorderMode.value = false;
        return;
    }
    reorder([...orderedIds.value], {
        onSuccess: () => {
            reorderMode.value = false;
        },
        onError: reportSaveError,
    });
};

// Switching to the desktop layout discards unsaved phone moves, as Cancel does.
watch(isDesktop, (desktop) => {
    cancelKeyboardPick();
    if (desktop && reorderMode.value) cancelReorder();
});
watch(trimmedQuery, cancelKeyboardPick);
</script>

<template>
    <SharedSectionBand
        title="Your rules"
        :meta="phoneReordering ? undefined : meta"
        :loading="loading"
        :error="error"
        :empty="isEmpty"
    >
        <template #label>
            <span class="inline-flex items-center gap-1.5">
                Your rules
                <SharedHintButton
                    icon="pi-info-circle"
                    aria-label="How rules run"
                    :tooltip="runOrderTooltip"
                    tooltip-html
                />
            </span>
        </template>

        <template #header-extra>
            <template v-if="phoneReordering">
                <Button
                    label="Cancel"
                    text
                    severity="secondary"
                    size="small"
                    :disabled="isSaving"
                    @click="cancelReorder"
                />
                <Button
                    label="Done"
                    icon="pi pi-check"
                    size="small"
                    :loading="isSaving"
                    @click="finishReorder"
                />
            </template>
            <Button
                v-else-if="canStartReorder"
                label="Reorder"
                icon="pi pi-sort-alt"
                severity="secondary"
                outlined
                size="small"
                @click="enterReorder"
            />
        </template>

        <template #empty>
            <SharedEmptyState
                icon="pi-bolt"
                title="No rules yet"
                text="Rules set a category on new transactions for you. Create one here, or from a transaction's ⋮ menu."
                action-label="New rule"
                @action="emit('create')"
            />
        </template>

        <p
            class="sr-only"
            aria-live="polite"
        >
            {{ announcement }}
        </p>

        <p
            v-if="phoneReordering"
            class="px-4 pb-3 text-xs text-muted-color md:px-0"
        >
            Drag a grip or use the arrows to reorder.
        </p>

        <div
            v-else
            class="px-4 pb-3 md:px-0 md:pb-3"
        >
            <IconField class="w-full md:max-w-[360px]">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="query"
                    placeholder="Search rules"
                    aria-label="Search rules"
                    class="w-full"
                />
            </IconField>
        </div>

        <p
            v-if="visibleRules.length === 0"
            class="px-4 pb-4 text-sm text-muted-color md:px-0"
        >
            No rules match "{{ trimmedQuery }}".
        </p>

        <div
            v-else
            ref="listEl"
            class="divide-y divide-surface-200 dark:divide-surface-700"
        >
            <RuleRow
                v-for="(rule, index) in visibleRules"
                :key="rule.id"
                :rule="rule"
                :context="context"
                :reordering="phoneReordering"
                @toggle="(isActive) => emit('toggle', rule, isActive)"
                @actions="(event) => emit('actions', event, rule)"
                @open="emit('edit', rule)"
            >
                <template
                    v-if="isDesktop || phoneReordering"
                    #grip
                >
                    <Button
                        :id="gripId(rule.id)"
                        icon="pi pi-bars"
                        text
                        rounded
                        size="small"
                        class="rule-grip shrink-0 cursor-grab text-muted-color"
                        aria-label="Drag to reorder"
                        :disabled="trimmedQuery !== ''"
                        @click.stop
                        @keydown="onGripKeydown($event, rule)"
                        @focusout="onGripFocusout(rule.id)"
                    />
                </template>
                <template #move>
                    <Button
                        icon="pi pi-arrow-up"
                        text
                        rounded
                        size="small"
                        class="shrink-0 text-muted-color"
                        aria-label="Move up"
                        :disabled="!canMoveUp(index)"
                        @click="moveRow(index, -1)"
                    />
                    <Button
                        icon="pi pi-arrow-down"
                        text
                        rounded
                        size="small"
                        class="shrink-0 text-muted-color"
                        aria-label="Move down"
                        :disabled="!canMoveDown(index, visibleRules.length)"
                        @click="moveRow(index, 1)"
                    />
                </template>
            </RuleRow>
        </div>
    </SharedSectionBand>
</template>
