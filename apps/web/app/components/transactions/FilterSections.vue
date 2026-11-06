<script setup lang="ts">
/**
 * The three drawer filters as collapsible sections (Type, Accounts, Categories), with the Show hidden switch and Clear
 * all below. The desktop drawer opens it expanded; the mobile sheet opens it collapsed. Each section's header
 * summarises its selection, and its body is the shared option list. Selection math lives in the option list.
 */
import type { TransactionType } from "@badger/shared-data";
import { FILTER_COPY, filterSelectionLabel, type FilterNoun } from "~/utils/filterLabels";
import type { FilterOption } from "~/utils/filterOptions";

interface Props {
    typeOptions: FilterOption<TransactionType>[];
    accountOptions: FilterOption[];
    categoryOptions: FilterOption[];
    /** Whether the sections start open. Read once, so the user's own open and closed sections survive a re-render. */
    defaultExpanded: boolean;
    /** Drawer filters and the period. Clear all is disabled at zero. */
    activeFilterCount: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{ (event: "clear-all"): void }>();

const selectedTypes = defineModel<TransactionType[]>("selectedTypes", { required: true });
const selectedAccountIds = defineModel<string[]>("selectedAccountIds", { required: true });
const selectedCategoryIds = defineModel<string[]>("selectedCategoryIds", { required: true });
const showHidden = defineModel<boolean>("showHidden", { required: true });

const SECTIONS = ["types", "accounts", "categories"];
const expanded = ref<string[]>(props.defaultExpanded ? [...SECTIONS] : []);

const toggleId = useId();

// The header's right-hand summary: the label of the one selected option, a count, or "All" when nothing is selected.
function summaryOf(noun: FilterNoun, options: readonly FilterOption[], selected: readonly string[]): string {
    const chosen = options.filter((option) => selected.includes(option.value));
    return filterSelectionLabel(noun, chosen) ?? "All";
}

const typeSummary = computed(() => summaryOf("types", props.typeOptions, selectedTypes.value));
const accountSummary = computed(() => summaryOf("accounts", props.accountOptions, selectedAccountIds.value));
const categorySummary = computed(() => summaryOf("categories", props.categoryOptions, selectedCategoryIds.value));
</script>

<template>
    <div class="flex flex-col gap-4">
        <Accordion
            v-model:value="expanded"
            multiple
        >
            <AccordionPanel value="types">
                <AccordionHeader>
                    <span class="font-semibold text-surface-900 dark:text-surface-0">{{
                        FILTER_COPY.types.title
                    }}</span>
                    <span class="ml-auto mr-2 pl-3 text-sm text-muted-color">{{ typeSummary }}</span>
                </AccordionHeader>
                <AccordionContent>
                    <TransactionsFilterOptionList
                        v-model:selected="selectedTypes"
                        :options="typeOptions"
                        :all-label="FILTER_COPY.types.allLabel"
                        actions-placement="footer"
                    />
                </AccordionContent>
            </AccordionPanel>

            <AccordionPanel value="accounts">
                <AccordionHeader>
                    <span class="font-semibold text-surface-900 dark:text-surface-0">{{
                        FILTER_COPY.accounts.title
                    }}</span>
                    <span class="ml-auto mr-2 pl-3 text-sm text-muted-color">{{ accountSummary }}</span>
                </AccordionHeader>
                <AccordionContent>
                    <TransactionsFilterOptionList
                        v-model:selected="selectedAccountIds"
                        :options="accountOptions"
                        :all-label="FILTER_COPY.accounts.allLabel"
                        actions-placement="footer"
                    />
                </AccordionContent>
            </AccordionPanel>

            <AccordionPanel value="categories">
                <AccordionHeader>
                    <span class="font-semibold text-surface-900 dark:text-surface-0">{{
                        FILTER_COPY.categories.title
                    }}</span>
                    <span class="ml-auto mr-2 pl-3 text-sm text-muted-color">{{ categorySummary }}</span>
                </AccordionHeader>
                <AccordionContent>
                    <TransactionsFilterOptionList
                        v-model:selected="selectedCategoryIds"
                        :options="categoryOptions"
                        :all-label="FILTER_COPY.categories.allLabel"
                        actions-placement="footer"
                    />
                </AccordionContent>
            </AccordionPanel>
        </Accordion>

        <div class="flex items-center justify-between gap-3 border-t border-surface-200 pt-4 dark:border-surface-700">
            <div class="flex items-center gap-2">
                <ToggleSwitch
                    v-model="showHidden"
                    :input-id="toggleId"
                />
                <label
                    :for="toggleId"
                    class="text-sm text-surface-700 dark:text-surface-200"
                >
                    Show hidden transactions
                </label>
            </div>
            <Button
                label="Clear all"
                link
                size="small"
                :disabled="activeFilterCount === 0"
                @click="emit('clear-all')"
            />
        </div>
    </div>
</template>
