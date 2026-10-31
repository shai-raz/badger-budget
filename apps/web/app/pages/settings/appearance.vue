<script setup lang="ts">
import { COLOR_THEMES } from "@badger/shared-data";
import { useSelectColorTheme } from "../../composables/settings/useSelectColorTheme";
import { nextRadioIndex } from "../../utils/radioGroup";
import { COLOR_MODE_OPTIONS, type ColorModePreference } from "../../utils/theme";

// fullBleed: below md the bands run edge to edge, as on Settings (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const themeStore = useThemeStore();
const { select, isDeviceOnly } = useSelectColorTheme();
const groupRef = ref<HTMLElement | null>(null);

const modePreference = computed<ColorModePreference>({
    get: () => themeStore.modePreference,
    set: (pref) => themeStore.setModePreference(pref),
});

// Arrow keys move and select, as in a native radio group; the roving tabindex leaves one radio in the tab order.
async function onKeydown(event: KeyboardEvent) {
    const current = COLOR_THEMES.indexOf(themeStore.colorTheme);
    const next = nextRadioIndex(current, event.key, COLOR_THEMES.length);
    const nextName = next === null ? undefined : COLOR_THEMES[next];
    if (next === null || nextName === undefined) return;

    event.preventDefault();
    select(nextName);
    await nextTick();
    groupRef.value?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
}
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Appearance"
            back-to="/settings"
        />

        <SharedSectionBand
            title="Color theme"
            heading-id="color-theme-heading"
            :meta="isDeviceOnly ? 'Saved on this device' : 'Synced to your account'"
        >
            <div
                ref="groupRef"
                role="radiogroup"
                aria-labelledby="color-theme-heading"
                class="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:px-0 md:pb-0"
                @keydown="onKeydown"
            >
                <SettingsColorThemeTile
                    v-for="name in COLOR_THEMES"
                    :key="name"
                    :name="name"
                    :checked="themeStore.colorTheme === name"
                    @select="select(name)"
                />
            </div>
        </SharedSectionBand>

        <SharedSectionBand title="Mode">
            <div class="flex flex-col gap-2 px-4 pb-4 md:px-0 md:pb-0">
                <SelectButton
                    v-model="modePreference"
                    :options="COLOR_MODE_OPTIONS"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                    aria-label="Mode"
                    class="flex w-full"
                    :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
                />
                <p class="text-xs text-muted-color">Saved on this device.</p>
            </div>
        </SharedSectionBand>
    </div>
</template>
