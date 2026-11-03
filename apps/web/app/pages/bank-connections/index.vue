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
const { openCreate, openEdit } = useConnectionEditor();

const connectionCountLabel = computed(() => {
    const count = scraperConnections.value?.length ?? 0;
    return count === 1 ? "1 connection" : `${count} connections`;
});

const handleAddConnection = () => openCreate();

// Switch values being saved, by connection id. A row's switch shows its pending value and stays disabled until the save
// settles, after the list has refetched, so a second click can't race the first.
const pendingToggles = ref<Partial<Record<string, boolean>>>({});
const pendingToggle = (connection: IScraperConnectionResponse) => pendingToggles.value[connection.id];

// PrimeVue's switch flips itself on click and only resyncs when its bound value changes. Binding the pending value
// (then the server's, once settled) means a failed save always moves the bound value back.
const handleToggleConnection = async (connection: IScraperConnectionResponse, isActive: boolean) => {
    pendingToggles.value = { ...pendingToggles.value, [connection.id]: isActive };
    try {
        await updateConnectionMutation.mutateAsync({
            id: connection.id,
            data: { isActive },
        });
    } catch (err) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(err, "Failed to update connection"),
            life: 5000,
        });
    } finally {
        pendingToggles.value = Object.fromEntries(
            Object.entries(pendingToggles.value).filter(([id]) => id !== connection.id),
        );
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
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => openEdit(connection),
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
            link-to="/bank-connections/history"
            link-label="Sync history"
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
                    class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:px-0"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate font-semibold">{{ conn.displayName }}</span>
                        </div>
                        <BankSyncConnectionSubtitle :connection="conn" />
                    </div>
                    <ToggleSwitch
                        :model-value="pendingToggle(conn) ?? conn.isActive"
                        :disabled="pendingToggle(conn) !== undefined"
                        :aria-label="`Sync ${conn.displayName}`"
                        class="shrink-0"
                        @update:model-value="(value) => handleToggleConnection(conn, value === true)"
                    />
                    <Button
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        size="small"
                        aria-label="Connection actions"
                        class="shrink-0 text-muted-color"
                        @click="(event) => openMenu({ connection: conn, event })"
                    />
                    <BankSyncFailureStrip
                        :connection="conn"
                        class="col-span-full"
                    />
                </div>
            </div>
        </SharedSectionBand>

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        />
    </div>
</template>
