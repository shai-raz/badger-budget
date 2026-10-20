<script setup lang="ts">
/**
 * The one budget progress bar: 8px pill, fill coloured by the budget's level
 * (green, amber from 75%, red from 100%). The fill is capped at 100% visually;
 * the caller shows the real percentage.
 */
import { BUDGET_LEVEL_COLOR, budgetProgressLevel } from "~/utils/budget";

interface Props {
    percentage: number;
}

const props = defineProps<Props>();
</script>

<template>
    <ProgressBar
        :value="Math.min(props.percentage, 100)"
        :show-value="false"
        :dt="{
            value: { background: BUDGET_LEVEL_COLOR[budgetProgressLevel(props.percentage)] },
            height: '8px',
            borderRadius: '9999px',
        }"
    />
</template>
