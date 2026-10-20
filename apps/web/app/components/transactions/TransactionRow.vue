<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import { DEFAULT_CATEGORY_AVATAR_ICON, UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import { formatDate, transactionSign, transactionAmountClass } from "./formatters";
import { formatCurrency } from "~/utils/currency";
import { normalizeHex } from "~/utils/color";

interface Props {
    transaction: ITransactionResponse;
    /**
     * Whether clicking anywhere on the row (outside the overflow button)
     * navigates to the detail page. Rows navigate on both desktop and mobile.
     */
    clickable?: boolean;
    /**
     * What the sub-line under the description shows: the account name
     * (default, used by the transactions list) or the category name (used by
     * the dashboard's Recent transactions band, where the category pill is
     * already hidden via `showPill`).
     */
    subLine?: "date-account" | "date-category";
    /**
     * Whether to show the category pill — both the mobile inline pill and the
     * desktop right-side pill. Defaults to true.
     */
    showPill?: boolean;
    /** Whether to render the overflow (actions) button. Defaults to true. */
    showMenu?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    clickable: false,
    subLine: "date-account",
    showPill: true,
    showMenu: true,
});

const emit = defineEmits<{
    click: [transaction: ITransactionResponse];
    menuToggle: [payload: { transaction: ITransactionResponse; event: Event }];
}>();

const category = computed(() => props.transaction.category);
const categoryColor = computed(() => normalizeHex(category.value?.color) ?? UNCATEGORIZED_CATEGORY.color);
const categoryName = computed(() => category.value?.name || UNCATEGORIZED_CATEGORY.name);

const handleRowClick = () => {
    if (props.clickable) {
        emit("click", props.transaction);
    }
};

const handleMenuToggle = (event: Event) => {
    event.stopPropagation();
    emit("menuToggle", { transaction: props.transaction, event });
};
</script>

<template>
    <!-- The row owns its 16px gutter (px-4) on every surface it appears on, so the
         divider (this row's border-b) runs full width and the text lines up with
         the band headers above it. Callers add no horizontal padding. -->
    <div
        class="flex items-center gap-3 border-b border-surface-200 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface-50 md:gap-3.5 md:px-4 md:py-3 dark:border-surface-700 dark:hover:bg-surface-800"
        :class="[transaction.hidden ? 'opacity-60' : '', clickable ? 'cursor-pointer' : '']"
        :role="clickable ? 'button' : undefined"
        :tabindex="clickable ? 0 : undefined"
        @click="handleRowClick"
        @keydown.enter.prevent="handleRowClick"
        @keydown.space.prevent="handleRowClick"
    >
        <!-- Category-tinted avatar (36px mobile, 40px desktop) -->
        <SharedEntityAvatar
            :icon="category?.icon"
            :color="categoryColor"
            :fallback="DEFAULT_CATEGORY_AVATAR_ICON"
        />

        <!-- Description + sub-line -->
        <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold">{{ transaction.description }}</div>
            <!-- Category pill (mobile only; desktop shows it as a right-side pill instead) -->
            <SharedCategoryChip
                v-if="showPill"
                :name="categoryName"
                :color="category?.color"
                class="mt-0.5 md:hidden"
            />
            <div class="truncate text-[12.5px] text-muted-color">
                <span v-if="transaction.hidden">&#9676; Hidden &middot; </span
                >{{ formatDate(transaction.transactionDate) }} &middot;
                {{ subLine === "date-category" ? categoryName : transaction.account.name }}
            </div>
        </div>

        <!-- Category pill (hidden below md to avoid crowding narrow rows) -->
        <SharedCategoryChip
            v-if="showPill"
            :name="categoryName"
            :color="category?.color"
            class="hidden md:inline-flex"
        />

        <!-- Signed, color-coded amount. Reserves a 130px column on desktop so the
             amounts line up, but only as a minimum — large values grow the cell
             instead of being clipped. Mobile lets it size to content. -->
        <div
            class="shrink-0 text-right text-sm font-semibold tabular-nums md:min-w-[130px]"
            :class="transactionAmountClass(transaction)"
        >
            {{ transactionSign(transaction) }}{{ formatCurrency(transaction.amount, transaction.currency.code) }}
        </div>

        <!-- Overflow menu (shown on both mobile and desktop; stops propagation so it doesn't trigger row navigation) -->
        <Button
            v-if="showMenu"
            icon="pi pi-ellipsis-v"
            text
            rounded
            size="small"
            aria-label="Actions"
            class="inline-flex shrink-0 text-surface-500 dark:text-surface-400"
            @click="handleMenuToggle"
        />
    </div>
</template>
