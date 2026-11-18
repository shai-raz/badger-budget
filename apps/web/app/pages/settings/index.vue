<script setup lang="ts">
import { usePushDevice } from "../../composables/notifications/usePushDevice";
import { useSettingsSummaryQuery } from "../../composables/settings/useSettingsSummary";
import { initialsOf } from "../../utils/profile";
import { countLabel } from "../../utils/settingsSummary";
import { THEMES } from "../../theme/themes";
import { COLOR_MODE_OPTIONS } from "../../utils/theme";

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const authStore = useAuthStore();
const themeStore = useThemeStore();
const logout = useLogout();
const { data: systemInfo } = useSystemInfo();

const user = computed(() => authStore.user);
const fullName = computed(() => `${user.value?.firstName ?? ""} ${user.value?.lastName ?? ""}`.trim());
const modeLabel = computed(
    () => COLOR_MODE_OPTIONS.find((option) => option.value === themeStore.modePreference)?.label,
);
const appearanceSummary = computed(() => `${THEMES[themeStore.colorTheme].label} theme · ${modeLabel.value} mode`);

const push = usePushDevice();
onMounted(() => {
    void push.refresh();
});
const notificationsSummary = computed(() => {
    switch (push.state.value) {
        case "on":
            return "On for this device";
        case "off":
            return "Off for this device";
        case "denied":
            return "Blocked in this browser";
        case "ios-install":
            return "Needs Home Screen install";
        case "unsupported":
            return "Not supported here";
        default:
            return "";
    }
});

// Counts for the Transactions rows. No subtitle while loading, on error, or without data.
const summary = useSettingsSummaryQuery();
const summaryLoading = computed(() => summary.isLoading.value);
const summaryData = computed(() => (summary.isError.value ? undefined : summary.data.value));
const categoriesSummary = computed(() =>
    summaryData.value ? countLabel(summaryData.value.categories, "category", "categories") : null,
);
const rulesSummary = computed(() => (summaryData.value ? countLabel(summaryData.value.rules, "rule") : null));
const cardPayoffSummary = computed(() =>
    summaryData.value ? countLabel(summaryData.value.cardPayoffPatterns, "pattern") : null,
);
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Settings" />

        <SharedSectionBand aria-label="Profile">
            <div class="flex items-center gap-3 px-4 pt-4 pb-4 md:px-0 md:py-0">
                <Avatar
                    :label="initialsOf(user ?? {})"
                    shape="circle"
                    size="large"
                />
                <div class="flex min-w-0 flex-col">
                    <span class="text-base font-semibold">{{ fullName }}</span>
                    <span class="truncate text-sm text-muted-color">{{ user?.email }}</span>
                </div>
            </div>
        </SharedSectionBand>

        <SharedSectionBand aria-label="Preferences">
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <SettingsRow
                    to="/settings/appearance"
                    icon="pi pi-palette"
                    title="Appearance"
                    :subtitle="appearanceSummary"
                />
                <SettingsRow
                    to="/settings/notifications"
                    icon="pi pi-bell"
                    title="Notifications"
                    :subtitle="notificationsSummary"
                />
            </div>
        </SharedSectionBand>

        <SharedSectionBand aria-label="Transactions">
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <SettingsRow
                    to="/categories"
                    icon="pi pi-tags"
                    title="Categories"
                    :subtitle="categoriesSummary"
                    :loading="summaryLoading"
                />
                <SettingsRow
                    to="/settings/rules"
                    icon="pi pi-bolt"
                    title="Rules"
                    :subtitle="rulesSummary"
                    :loading="summaryLoading"
                />
                <SettingsRow
                    to="/settings/card-payoff-patterns"
                    icon="pi pi-credit-card"
                    title="Card payoff patterns"
                    :subtitle="cardPayoffSummary"
                    :loading="summaryLoading"
                />
            </div>
        </SharedSectionBand>

        <BankSyncPasskeysCard />

        <SettingsMcpConnectionsCard />

        <SettingsAboutCard />

        <SharedSectionBand aria-label="Log out">
            <SettingsRow
                icon="pi pi-sign-out"
                title="Log out"
                danger
                @click="logout()"
            />
        </SharedSectionBand>

        <p
            v-if="systemInfo?.version"
            class="text-center text-xs text-muted-color"
        >
            Badger Budget {{ systemInfo.version }}
        </p>
    </div>
</template>
