<script setup lang="ts">
import type { IOAuthConnection } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import {
    useMcpConfigQuery,
    useOAuthConnectionsQuery,
    useRevokeOAuthConnection,
} from "../../composables/useOAuthConnections";
import { MCP_DATA_SHARING_NOTICE, MCP_SETUP_GUIDES } from "../../utils/mcpCopy";
import { formatTimeAgo } from "../../utils/relativeTime";

definePageMeta({
    layout: "app",
    fullBleed: true,
});

interface HttpError {
    response?: { data?: { message?: string } };
}

const toast = useToast();
const confirm = useConfirm();
const { data: config, isLoading: configLoading } = useMcpConfigQuery();
const { data: connections, isLoading, error } = useOAuthConnectionsQuery();
const revokeMutation = useRevokeOAuthConnection();

const serverUrl = computed(() => config.value?.mcpServerUrl ?? "");
const list = computed(() => connections.value ?? []);

const connectionMeta = (conn: IOAuthConnection) => {
    const used = conn.lastUsedAt ? `Last used ${formatTimeAgo(conn.lastUsedAt)}` : "Never used";
    const date = new Date(conn.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${used} · connected ${date}`;
};

const copy = async (text: string, label: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.add({ severity: "success", summary: "Copied", detail: `${label} copied to clipboard`, life: 2000 });
    } catch {
        toast.add({ severity: "error", summary: "Error", detail: "Could not copy to clipboard", life: 4000 });
    }
};

const handleRevoke = (id: string, clientName: string) => {
    confirm.require({
        message: `${clientName} will immediately lose access to your Badger data. You can reconnect it later.`,
        header: "Revoke access",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Revoke",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await revokeMutation.mutateAsync(id);
                toast.add({ severity: "success", summary: "Success", detail: `${clientName} revoked`, life: 3000 });
            } catch (err: unknown) {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: (err as HttpError).response?.data?.message || "Failed to revoke access",
                    life: 5000,
                });
            }
        },
    });
};

// One menu for the connected apps, pointed at the row it was opened from.
const menu = ref();
const selected = ref<IOAuthConnection | null>(null);
const menuItems = computed<MenuItem[]>(() => [
    {
        label: "Revoke access",
        icon: "pi pi-ban",
        class: "text-red-500",
        command: () => {
            const conn = selected.value;
            if (conn) handleRevoke(conn.id, conn.clientName);
        },
    },
]);

function openMenu(event: Event, conn: IOAuthConnection) {
    selected.value = conn;
    menu.value?.toggle(event);
}
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="AI assistants"
            back-to="/settings"
        />

        <SharedSectionBand
            title="Connected apps"
            heading-id="connected-apps-heading"
            :loading="isLoading"
            :error="error"
            :empty="!isLoading && !list.length"
            empty-icon="pi-microchip-ai"
            empty-text="No apps connected yet. Pick one under Connect an app to get started."
        >
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <div
                    v-for="conn in list"
                    :key="conn.id"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <i
                        class="pi pi-microchip-ai text-muted-color"
                        aria-hidden="true"
                    />
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <span class="truncate text-sm font-semibold">{{ conn.clientName }}</span>
                        <span class="text-xs text-muted-color">{{ connectionMeta(conn) }}</span>
                    </div>
                    <Button
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        size="small"
                        aria-haspopup="menu"
                        :aria-label="`Actions for ${conn.clientName}`"
                        :disabled="revokeMutation.isPending.value"
                        class="shrink-0 text-muted-color"
                        @click="openMenu($event, conn)"
                    />
                </div>
            </div>
            <Menu
                ref="menu"
                :model="menuItems"
                popup
            />
        </SharedSectionBand>

        <SharedSectionBand
            title="Connect an app"
            heading-id="connect-app-heading"
        >
            <p class="px-4 pb-2 text-sm text-muted-color md:px-0">
                Ask Claude or another AI app about your spending. It can read your data but can't change anything.
            </p>

            <div class="flex items-center gap-3 border-t border-surface-200 px-4 py-3 md:px-0 dark:border-surface-700">
                <i
                    class="pi pi-link text-muted-color"
                    aria-hidden="true"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-sm font-semibold">Server URL</span>
                    <Skeleton
                        v-if="configLoading"
                        height="1rem"
                        class="w-full"
                    />
                    <span
                        v-else
                        class="truncate font-mono text-xs"
                        >{{ serverUrl }}</span
                    >
                </div>
                <Button
                    icon="pi pi-copy"
                    text
                    rounded
                    size="small"
                    aria-label="Copy server URL"
                    :disabled="!serverUrl"
                    class="shrink-0 text-muted-color"
                    @click="copy(serverUrl, 'Server URL')"
                />
            </div>

            <div
                class="flex flex-col gap-2.5 border-t border-surface-200 px-4 pt-3 pb-4 md:px-0 md:pb-0 dark:border-surface-700"
            >
                <p class="text-sm">
                    Add it as a custom connector (MCP server) in your app, then approve access when Badger asks.
                </p>
                <span class="text-xs font-semibold text-muted-color">Setup guides</span>
                <ul class="flex flex-wrap gap-2">
                    <li
                        v-for="guide in MCP_SETUP_GUIDES"
                        :key="guide.name"
                    >
                        <a
                            :href="guide.url"
                            target="_blank"
                            rel="noopener"
                            class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-surface-300 px-2.5 py-1 text-sm font-medium hover:bg-surface-100 dark:border-surface-600 dark:hover:bg-surface-800"
                            >{{ guide.name }}
                            <i
                                class="pi pi-arrow-up-right text-xs text-muted-color"
                                aria-hidden="true"
                            />
                        </a>
                    </li>
                </ul>
            </div>
        </SharedSectionBand>

        <p class="mx-4 text-xs text-muted-color md:mx-0">{{ MCP_DATA_SHARING_NOTICE }}</p>
    </div>
</template>
