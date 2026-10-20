<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useQuery, useMutation } from "@tanstack/vue-query";
import { useToast } from "primevue/usetoast";
import { useApiClient } from "~/composables/useApiClient";
import { useAuthStore } from "~/stores/auth";
import { createConsentGate } from "~/utils/consentGate";
import { MCP_DATA_SHARING_NOTICE, MCP_READ_ONLY_PERMISSIONS } from "~/utils/mcpCopy";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const apiClient = useApiClient();
const authStore = useAuthStore();

const requestId = computed(() => {
    const raw = route.query.request;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.length > 0 ? value : "";
});

const {
    data: consent,
    error,
    isLoading,
} = useQuery({
    queryKey: computed(() => ["oauth-consent", requestId.value]),
    queryFn: () => apiClient.getOAuthConsentRequest(requestId.value),
    enabled: computed(() => !!requestId.value),
    retry: false,
});

const errorMessage = computed(() => {
    if (framed) return "This page can't be shown inside another page.";
    if (!requestId.value) {
        return "This authorization request is missing. Start the connection again from your AI app.";
    }
    if (!error.value) return null;
    const status = (error.value as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
        return "This authorization request has expired or was already used. Start the connection again from your AI app.";
    }
    return "Something went wrong while loading this authorization request. Please try again.";
});

const decided = ref(false);
const framed = import.meta.client && window.top !== window.self;

const decision = useMutation({
    mutationFn: (approve: boolean) => apiClient.decideOAuthConsentRequest(requestId.value, approve),
    onSuccess: (data) => {
        decided.value = true;
        window.location.assign(data.redirectUrl);
    },
    onError: (err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.add({
            severity: "error",
            summary: "Error",
            detail:
                status === 404
                    ? "This authorization request has expired or was already used. Start the connection again from your AI app."
                    : "Could not record your decision. Please try again.",
            life: 5000,
        });
    },
});

// The request is bound to the first account that views it, so after switching accounts it
// can't be reused: sign out without a return path and restart from the AI app.
const signOut = async () => {
    await authStore.logout();
    await router.push({ path: "/auth/login" });
};

// DoubleClickjacking defence: Allow stays disabled until the page has been visible and
// focused for a moment and a real pointer/key event happened on it (see utils/consentGate).
const gate = createConsentGate();
const allowReady = ref(false);
let tick: ReturnType<typeof setInterval> | undefined;
const syncActive = () => {
    gate.setActive(document.visibilityState === "visible" && document.hasFocus(), Date.now());
    if (!allowReady.value) allowReady.value = gate.isReady(Date.now());
};
const onInteract = (e: Event) => {
    gate.interact(e.isTrusted);
    syncActive();
};
const INTERACT_EVENTS = ["pointermove", "pointerdown", "keydown"] as const;
onMounted(() => {
    syncActive();
    tick = setInterval(syncActive, 250);
    document.addEventListener("visibilitychange", syncActive);
    window.addEventListener("focus", syncActive);
    window.addEventListener("blur", syncActive);
    INTERACT_EVENTS.forEach((n) => window.addEventListener(n, onInteract, true));
});
onBeforeUnmount(() => {
    clearInterval(tick);
    document.removeEventListener("visibilitychange", syncActive);
    window.removeEventListener("focus", syncActive);
    window.removeEventListener("blur", syncActive);
    INTERACT_EVENTS.forEach((n) => window.removeEventListener(n, onInteract, true));
});
</script>

<template>
    <div
        class="flex items-center justify-center min-h-screen bg-surface-50 dark:bg-surface-950 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))]"
    >
        <Toast />
        <div class="w-full max-w-md">
            <Card v-if="errorMessage">
                <template #title>Authorization unavailable</template>
                <template #content>
                    <Message
                        severity="error"
                        :closable="false"
                        >{{ errorMessage }}</Message
                    >
                </template>
            </Card>

            <Card v-else-if="decided">
                <template #title>All done</template>
                <template #content>
                    <p class="text-sm">Your decision was recorded. You can close this tab and return to your AI app.</p>
                </template>
            </Card>

            <Card v-else-if="isLoading || !consent">
                <template #content>
                    <p class="text-center text-sm">Loading…</p>
                </template>
            </Card>

            <Card v-else>
                <template #title>
                    <template v-if="consent.verified">Connect {{ consent.clientName }} to Badger</template>
                    <template v-else>An app at {{ consent.redirectDisplay }} wants to connect to Badger</template>
                </template>
                <template #content>
                    <div class="flex flex-col gap-4">
                        <div
                            v-if="!consent.verified"
                            class="flex flex-col gap-2"
                        >
                            <div>
                                <Tag
                                    severity="warn"
                                    value="Unverified app"
                                />
                            </div>
                            <p class="text-sm">
                                The app calls itself
                                <strong class="break-all">"{{ consent.clientName }}"</strong>, but Badger can't confirm
                                who operates it. Only continue if you started this connection yourself.
                            </p>
                        </div>

                        <div class="text-sm">
                            <p>
                                After you approve, you'll be sent to:
                                <strong class="font-mono break-all">{{ consent.redirectDisplay }}</strong>
                            </p>
                            <p
                                v-if="consent.loopback"
                                class="mt-1"
                            >
                                This app runs on your own computer.
                            </p>
                        </div>

                        <div class="text-sm">
                            <p class="font-semibold mb-1">Permissions</p>
                            <p>{{ MCP_READ_ONLY_PERMISSIONS }}</p>
                        </div>

                        <p class="text-sm">{{ MCP_DATA_SHARING_NOTICE }}</p>

                        <p class="text-sm">
                            Signed in as {{ authStore.user?.email }}.
                            <a
                                href="#"
                                class="text-primary underline"
                                @click.prevent="signOut"
                                >Not you? Sign out</a
                            >, then start again from your AI app.
                        </p>

                        <div class="flex gap-2 justify-end">
                            <Button
                                label="Deny"
                                severity="secondary"
                                variant="outlined"
                                :disabled="decision.isPending.value"
                                @click="decision.mutate(false)"
                            />
                            <Button
                                label="Allow"
                                :disabled="decision.isPending.value || !allowReady"
                                @click="decision.mutate(true)"
                            />
                        </div>
                    </div>
                </template>
            </Card>
        </div>
    </div>
</template>
