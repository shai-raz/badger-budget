<script setup lang="ts">
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
import type { IScraperConnectionResponse } from "@badger/types";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const toast = useToast();
const { busy: syncBusy, requestSync } = useBankSyncFlow();
const confirm = useConfirm();

const {
    data: scraperConnections,
    isLoading: connectionsLoading,
    error: connectionsError,
} = useScraperConnectionsQuery();
const updateConnectionMutation = useUpdateScraperConnectionMutation();
const deleteConnectionMutation = useDeleteScraperConnectionMutation();
const showConnectionModal = ref(false);
const editingConnection = ref<IScraperConnectionResponse | null>(null);

const connectionCountLabel = computed(() => {
    const count = scraperConnections.value?.length ?? 0;
    return count === 1 ? "1 connection" : `${count} connections`;
});

const handleAddConnection = () => {
    editingConnection.value = null;
    showConnectionModal.value = true;
};

const handleEditConnection = (connection: IScraperConnectionResponse) => {
    editingConnection.value = connection;
    showConnectionModal.value = true;
};

const handleConnectionModalClose = () => {
    showConnectionModal.value = false;
    editingConnection.value = null;
};

const handleToggleConnection = async (connection: IScraperConnectionResponse) => {
    try {
        await updateConnectionMutation.mutateAsync({
            id: connection.id,
            data: { isActive: !connection.isActive },
        });
        toast.add({
            severity: "success",
            summary: "Updated",
            detail: `Connection ${connection.isActive ? "paused" : "resumed"}`,
            life: 3000,
        });
    } catch (err) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(err, "Failed to update connection"),
            life: 5000,
        });
    }
};

const handleDeleteConnection = (connection: IScraperConnectionResponse) => {
    confirm.require({
        message: `Are you sure you want to delete the connection "${connection.displayName}"?`,
        header: "Delete connection",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Delete",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await deleteConnectionMutation.mutateAsync(connection.id);
                toast.add({
                    severity: "success",
                    summary: "Deleted",
                    detail: "Connection deleted",
                    life: 3000,
                });
            } catch (err) {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: getApiErrorMessage(err, "Failed to delete connection"),
                    life: 5000,
                });
            }
        },
    });
};

// The ⋮ menu is shared by every row: it is pointed at one connection when opened.
const menu = ref();
const selectedConnection = ref<IScraperConnectionResponse | null>(null);

const menuItems = computed(() => {
    const connection = selectedConnection.value;
    if (!connection) return [];
    return [
        {
            label: "Sync",
            icon: "pi pi-sync",
            disabled: !connection.isActive || syncBusy.value,
            command: () => requestSync({ connectionId: connection.id }),
        },
        {
            label: connection.isActive ? "Pause" : "Resume",
            icon: connection.isActive ? "pi pi-pause" : "pi pi-play",
            command: () => handleToggleConnection(connection),
        },
        {
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => handleEditConnection(connection),
        },
        {
            label: "Delete",
            icon: "pi pi-trash",
            command: () => handleDeleteConnection(connection),
        },
    ];
});

const openMenu = ({ connection, event }: { connection: IScraperConnectionResponse; event: Event }) => {
    selectedConnection.value = connection;
    menu.value?.toggle(event);
};

const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

const connectionDetails = (connection: IScraperConnectionResponse) => {
    const synced = connection.lastSyncedAt ? `Last synced ${formatDate(connection.lastSyncedAt)}` : "Never synced";
    return `${connection.companyId} · ${connection.scrapeLookbackDays} days lookback · ${synced}`;
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Bank connections">
            <template #actions>
                <LayoutHeaderSync />
                <LayoutHeaderButton
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New connection"
                    @click="handleAddConnection"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Connections"
            :meta="connectionCountLabel"
            :loading="connectionsLoading"
            :error="connectionsError"
            :empty="!scraperConnections || scraperConnections.length === 0"
        >
            <template #empty>
                <SharedEmptyState
                    icon="pi-link"
                    text="Connect a bank to sync transactions automatically"
                    action-label="Add a connection"
                    @action="handleAddConnection"
                />
            </template>

            <div class="divide-y divide-surface-200 dark:divide-surface-700">
                <div
                    v-for="conn in scraperConnections"
                    :key="conn.id"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate font-semibold">{{ conn.displayName }}</span>
                            <SharedStatusTag
                                :value="conn.isActive ? 'Active' : 'Paused'"
                                :tone="conn.isActive ? 'success' : 'neutral'"
                                class="shrink-0"
                            />
                        </div>
                        <p class="truncate text-xs text-muted-color">
                            {{ connectionDetails(conn) }}
                        </p>
                    </div>
                    <Button
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        size="small"
                        aria-label="Connection actions"
                        class="shrink-0 text-muted-color"
                        @click="(event) => openMenu({ connection: conn, event })"
                    />
                </div>
            </div>
        </SharedSectionBand>

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        />

        <BankSyncScraperConnectionModal
            v-model:visible="showConnectionModal"
            :connection="editingConnection"
            @close="handleConnectionModalClose"
        />
    </div>
</template>
