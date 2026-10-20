import { defineStore } from "pinia";
import { computed, ref } from "vue";

type MonthRange = {
    from: string;
    to: string;
};

function getCurrentMonthString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const useTransactionsStore = defineStore("transactions", () => {
    const currentMonth = getCurrentMonthString();

    // State
    const selectedMonthRange = ref<MonthRange>({
        from: currentMonth,
        to: currentMonth,
    });
    const showHidden = ref(false);

    // Actions
    function setSelectedMonthRange(range: MonthRange) {
        selectedMonthRange.value = { ...range };
    }

    function setShowHidden(value: boolean) {
        showHidden.value = value;
    }

    return {
        // State
        selectedMonthRange: computed(() => selectedMonthRange.value),
        showHidden: computed(() => showHidden.value),

        // Actions
        setSelectedMonthRange,
        setShowHidden,
    };
});
