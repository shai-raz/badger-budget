<script setup lang="ts">
import { watch } from "vue";
import { shouldSyncGoogleSheet } from "~/utils/appConfig";
import { useInstanceConfig } from "~/composables/useInstanceConfig";
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
const config = useInstanceConfig();
const { mutate } = useGoogleSheet();

if (import.meta.dev) useHead({ title: "Badger (Local)" });

// Sync once per session, as soon as the user is signed in and Sheets is configured on this instance.
let hasSynced = false;
watch(
    () => shouldSyncGoogleSheet(config.data.value, authStore.isAuthenticated),
    (shouldSync) => {
        if (shouldSync && !hasSynced) {
            hasSynced = true;
            mutate();
        }
    },
    { immediate: true },
);
</script>
<template>
    <NuxtPwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>

<style>
/* App-wide base background so no viewport region (overscroll, unpainted gaps)
   ever falls through to the raw browser canvas. Uses PrimeVue surface tokens;
   the `.dark` class on <html> is toggled by the theme store. PrimeVue's CSS vars
   are injected at runtime, so the hex fallbacks are what paints before the bundle
   runs (no white flash in dark mode). */
html {
    background-color: var(--p-surface-0, #ffffff);
}
html.dark {
    background-color: var(--p-surface-900, #111111);
    color-scheme: dark;
}
/* App layout only (class set by layouts/app.vue): the inner scroller is the only vertical scroller, and the document itself must never scroll or bounce. The :has() rule covers the root scroller; on browsers without :has(), body overflow still propagates to the viewport. */
html:has(> body.app-layout-body),
body.app-layout-body {
    overflow: hidden;
    overscroll-behavior: none;
}
</style>
