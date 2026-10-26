import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useTransactionsStore = defineStore("transactions", () => {
    // State
    const showHidden = ref(false);

    // Actions
    function setShowHidden(value: boolean) {
        showHidden.value = value;
    }

    return {
        // State
        showHidden: computed(() => showHidden.value),

        // Actions
        setShowHidden,
    };
});
