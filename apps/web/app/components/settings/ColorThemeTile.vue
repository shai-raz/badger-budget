<script setup lang="ts">
import type { ColorThemeName } from "@badger/shared-data";
import { THEMES } from "~/theme/themes";
import { themeSwatch } from "~/theme/resolve";

interface Props {
    name: ColorThemeName;
    checked: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ select: [] }>();

const themeStore = useThemeStore();
const definition = computed(() => THEMES[props.name]);
// The tile shows another theme, so its colours are resolved here rather than read from CSS variables.
const swatch = computed(() => themeSwatch(definition.value, themeStore.colorMode));
</script>

<template>
    <button
        type="button"
        role="radio"
        :aria-checked="checked"
        :tabindex="checked ? 0 : -1"
        class="rounded-[10px] border bg-surface-0 p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-surface-900"
        :class="checked ? 'border-primary ring-1 ring-primary' : 'border-surface-200 dark:border-surface-700'"
        @click="emit('select')"
    >
        <div
            aria-hidden="true"
            class="rounded-[7px] p-2.5"
            :style="{ backgroundColor: swatch.page }"
        >
            <div
                class="flex flex-col gap-2 rounded-md border p-2"
                :style="{ backgroundColor: swatch.card, borderColor: swatch.border }"
            >
                <div class="flex items-center gap-2">
                    <span
                        class="h-1.5 w-11 rounded-full"
                        :style="{ backgroundColor: swatch.border }"
                    />
                    <span
                        class="h-3 w-[30px] rounded-full"
                        :style="{ backgroundColor: swatch.primary }"
                    />
                </div>
                <div class="flex items-center gap-2 text-xs font-semibold tabular-nums">
                    <span :style="{ color: swatch.income }">+120</span>
                    <span :style="{ color: swatch.expense }">&minus;45</span>
                </div>
            </div>
        </div>

        <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-sm font-semibold">{{ definition.label }}</span>
            <span
                v-if="checked"
                aria-hidden="true"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast"
            >
                <i class="pi pi-check text-[10px]" />
            </span>
        </div>
    </button>
</template>
