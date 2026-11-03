<script setup lang="ts">
/**
 * The review step of the rule editor: the transactions a draft would change, all ticked to start with. The parent
 * owns the selection (v-model:selection), so it survives a trip back to the form. The list is paged, filtered and
 * searched here, and the header counts cover the whole list, not just the rows loaded so far.
 */
import { DEFAULT_CATEGORY_AVATAR_ICON, UNCATEGORIZED_CATEGORY, type RulePreviewFilter } from "@badger/shared-data";
import type { RuleDraft, RulePreviewItem } from "@badger/types";
import { useRulePreviewList } from "~/composables/rules/useRulePreviewList";
import { getApiErrorMessage } from "~/utils/apiError";
import { normalizeHex } from "~/utils/color";
import { formatCurrency } from "~/utils/currency";
import {
    headerState,
    isSelected,
    selectedCount,
    toggleAll,
    toggleRow,
    type RuleSelection,
} from "~/utils/ruleReviewSelection";
import { formatDate, transactionAmountClass, transactionSign } from "../transactions/formatters";

interface Props {
    draft: RuleDraft;
    /** The category the rule sets: the target of every ticked row. */
    category: { name: string; color: string; icon: string | null };
    selection: RuleSelection;
}

const props = defineProps<Props>();
const emit = defineEmits<{ "update:selection": [value: RuleSelection] }>();

const FILTERS: { value: RulePreviewFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "uncategorized", label: "Uncategorized" },
    { value: "categorized", label: "Has a category" },
];

const ARROW = "\u2192";
const DOT = " \u00b7 ";

const filter = ref<RulePreviewFilter>("all");
const search = ref("");
const scrollEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);

const {
    items,
    wouldChangeCount,
    alreadyTargetCount,
    counts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
} = useRulePreviewList(() => props.draft, filter, search);

// Infinite scroll: the sentinel sits below the rows inside the scroller, so the observer measures against it.
useIntersectionObserver(
    sentinelEl,
    ([entry]) => {
        if (entry?.isIntersecting && hasNextPage.value && !isFetchingNextPage.value) void fetchNextPage();
    },
    { root: scrollEl, rootMargin: "300px" },
);

const loadError = computed(() =>
    error.value ? getApiErrorMessage(error.value, "Could not load these transactions") : null,
);

const countOf = (value: RulePreviewFilter) => counts.value?.[value] ?? 0;

const selected = computed(() => selectedCount(props.selection, wouldChangeCount.value));
const headState = computed(() => headerState(props.selection, wouldChangeCount.value));
const toggleHeader = () => emit("update:selection", toggleAll(props.selection, wouldChangeCount.value));
const toggleItem = (id: string) => emit("update:selection", toggleRow(props.selection, id));

const isTicked = (item: RulePreviewItem) => isSelected(props.selection, item.id);
const fromName = (item: RulePreviewItem) => item.category?.name ?? UNCATEGORIZED_CATEGORY.name;
const targetColor = computed(() => normalizeHex(props.category.color) ?? UNCATEGORIZED_CATEGORY.color);
const avatarColor = (item: RulePreviewItem) => normalizeHex(item.category?.color) ?? UNCATEGORIZED_CATEGORY.color;

const rowMeta = (item: RulePreviewItem) =>
    [
        formatDate(item.transactionDate),
        item.accountName,
        `${fromName(item)} ${ARROW} ${isTicked(item) ? props.category.name : "stays as it is"}`,
    ]
        .filter(Boolean)
        .join(DOT);
</script>

<template>
    <!-- Desktop: the list is a bordered box capped at 24rem. Phone (fullscreen dialog, so page rules): flush divided
         rows to the dialog edges, filling the rest of the screen. The dialog must set FormDialog fill-body. -->
    <div class="flex flex-col gap-3 max-md:min-h-0 max-md:flex-1">
        <p class="text-sm">
            <span class="font-semibold tabular-nums">{{ wouldChangeCount }}</span>
            {{ wouldChangeCount === 1 ? "transaction would move to" : "transactions would move to" }}
            <SharedCategoryChip
                :name="category.name"
                :color="targetColor"
                :show-icon="false"
                class="align-middle"
            />.
            <span class="text-muted-color">{{ alreadyTargetCount }} more already have it.</span>
        </p>

        <InputText
            v-model="search"
            placeholder="Search descriptions"
            aria-label="Search descriptions"
            class="w-full"
        />

        <div
            class="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter transactions"
        >
            <Button
                v-for="option in FILTERS"
                :key="option.value"
                size="small"
                rounded
                :outlined="filter !== option.value"
                :severity="filter === option.value ? undefined : 'secondary'"
                :aria-pressed="filter === option.value"
                @click="filter = option.value"
            >
                {{ option.label }}
                <span class="ml-1 tabular-nums">{{ countOf(option.value) }}</span>
            </Button>
        </div>

        <div class="flex items-center gap-3 px-1 text-sm max-md:px-0">
            <Checkbox
                :model-value="headState === 'all'"
                :indeterminate="headState === 'some'"
                :binary="true"
                aria-label="Select all transactions"
                @update:model-value="toggleHeader"
            />
            <span class="font-medium tabular-nums">{{ selected }} of {{ wouldChangeCount }} selected</span>
            <span class="text-muted-color">&middot; newest first</span>
        </div>

        <Message
            v-if="loadError"
            severity="error"
            :closable="false"
            >{{ loadError }}</Message
        >

        <div
            ref="scrollEl"
            class="overflow-y-auto border-surface-200 max-md:-mx-5 max-md:min-h-0 max-md:flex-1 max-md:border-y md:max-h-[24rem] md:rounded-lg md:border dark:border-surface-700"
        >
            <div
                v-if="isLoading"
                class="flex items-center justify-center gap-2 py-6 text-muted-color"
            >
                <i
                    class="pi pi-spin pi-spinner"
                    aria-hidden="true"
                ></i>
                <span>Loading transactions...</span>
            </div>

            <SharedEmptyState
                v-else-if="items.length === 0 && !loadError"
                icon="pi-inbox"
                text="No transactions match these filters."
            />

            <ul v-else-if="items.length > 0">
                <li
                    v-for="item in items"
                    :key="item.id"
                    class="flex items-center gap-3 border-b border-surface-200 px-3 py-2.5 last:border-b-0 max-md:px-5 dark:border-surface-700"
                    :class="isTicked(item) ? '' : 'opacity-60'"
                >
                    <Checkbox
                        :model-value="isTicked(item)"
                        :binary="true"
                        :aria-label="'Include ' + item.description"
                        @update:model-value="toggleItem(item.id)"
                    />
                    <SharedEntityAvatar
                        :icon="item.category?.icon"
                        :color="avatarColor(item)"
                        :fallback="DEFAULT_CATEGORY_AVATAR_ICON"
                    />
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-semibold">{{ item.description }}</div>
                        <div class="truncate text-[12.5px] text-muted-color">{{ rowMeta(item) }}</div>
                    </div>
                    <div
                        class="shrink-0 text-right text-sm font-semibold tabular-nums"
                        :class="transactionAmountClass(item)"
                    >
                        {{ transactionSign(item) }}{{ formatCurrency(item.amount, item.currencyCode) }}
                    </div>
                </li>
            </ul>

            <div
                v-if="isFetchingNextPage"
                class="flex items-center justify-center gap-2 py-3 text-muted-color"
            >
                <i
                    class="pi pi-spin pi-spinner"
                    aria-hidden="true"
                ></i>
                <span>Loading more...</span>
            </div>

            <div
                ref="sentinelEl"
                aria-hidden="true"
                class="h-px"
            ></div>
        </div>

        <p
            v-if="items.length > 0"
            class="text-center text-sm text-muted-color"
        >
            Showing {{ items.length }} of {{ countOf(filter) }}
        </p>
    </div>
</template>
