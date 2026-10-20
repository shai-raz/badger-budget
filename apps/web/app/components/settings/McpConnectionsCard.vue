<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { MCP_DATA_SHARING_NOTICE } from "../../utils/mcpCopy";
import { formatTimeAgo } from "../../utils/relativeTime";

interface HttpError {
    response?: { data?: { message?: string } };
}

const toast = useToast();
const confirm = useConfirm();
const { data: config, isLoading: configLoading } = useMcpConfigQuery();
const { data: connections, isLoading, isError } = useOAuthConnectionsQuery();
const revokeMutation = useRevokeOAuthConnection();

const serverUrl = computed(() => config.value?.mcpServerUrl ?? "");
const urlPlaceholder = computed(() => serverUrl.value || "<MCP server URL>");
const claudeCodeCommand = computed(() => `claude mcp add --transport http badger ${urlPlaceholder.value}`);
const cursorJson = computed(() => JSON.stringify({ mcpServers: { badger: { url: urlPlaceholder.value } } }, null, 2));
const list = computed(() => connections.value ?? []);

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
</script>

<template>
    <SharedSectionBand title="AI assistants (MCP)">
        <div class="px-4 pb-4 md:px-0 md:pb-0">
            <p class="text-surface-600 dark:text-surface-300 mb-3">
                Connect Claude or other MCP apps to ask questions about your spending. Access is read-only.
            </p>

            <label
                for="mcp-server-url"
                class="text-sm font-medium"
                >MCP server URL</label
            >
            <div class="flex flex-col sm:flex-row gap-2 mt-1 mb-4">
                <Skeleton
                    v-if="configLoading"
                    height="2.5rem"
                    class="w-full"
                />
                <InputText
                    v-else
                    id="mcp-server-url"
                    :model-value="serverUrl"
                    readonly
                    class="w-full font-mono"
                />
                <Button
                    icon="pi pi-copy"
                    label="Copy"
                    severity="secondary"
                    class="shrink-0"
                    aria-label="Copy MCP server URL"
                    :disabled="!serverUrl"
                    @click="copy(serverUrl, 'Server URL')"
                />
            </div>

            <Accordion class="mb-4">
                <AccordionPanel value="claude-ai">
                    <AccordionHeader>claude.ai (also Claude mobile and desktop)</AccordionHeader>
                    <AccordionContent>
                        <p class="text-sm">
                            Go to Settings &rarr; Connectors &rarr; Add custom connector, paste the server URL above,
                            and click Connect. Then approve access on the Badger page.
                        </p>
                    </AccordionContent>
                </AccordionPanel>
                <AccordionPanel value="claude-code">
                    <AccordionHeader>Claude Code</AccordionHeader>
                    <AccordionContent>
                        <p class="text-sm mb-2">Run this command:</p>
                        <div class="flex flex-col sm:flex-row gap-2 mb-2">
                            <pre
                                class="m-0 p-2 rounded bg-surface-100 dark:bg-surface-800 text-xs font-mono overflow-x-auto grow"
                                >{{ claudeCodeCommand }}</pre
                            >
                            <Button
                                icon="pi pi-copy"
                                severity="secondary"
                                text
                                aria-label="Copy command"
                                class="shrink-0"
                                @click="copy(claudeCodeCommand, 'Command')"
                            />
                        </div>
                        <p class="text-sm">Then run <code>/mcp</code> in Claude Code to authenticate.</p>
                    </AccordionContent>
                </AccordionPanel>
                <AccordionPanel value="cursor">
                    <AccordionHeader>Cursor</AccordionHeader>
                    <AccordionContent>
                        <p class="text-sm mb-2">
                            Go to Settings &rarr; MCP &rarr; Add new MCP server and enter the URL, or add this to
                            <code>.cursor/mcp.json</code>:
                        </p>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <pre
                                class="m-0 p-2 rounded bg-surface-100 dark:bg-surface-800 text-xs font-mono overflow-x-auto grow"
                                >{{ cursorJson }}</pre
                            >
                            <Button
                                icon="pi pi-copy"
                                severity="secondary"
                                text
                                aria-label="Copy JSON"
                                class="shrink-0"
                                @click="copy(cursorJson, 'Config')"
                            />
                        </div>
                    </AccordionContent>
                </AccordionPanel>
            </Accordion>

            <p class="text-sm text-surface-600 dark:text-surface-300 mb-4">{{ MCP_DATA_SHARING_NOTICE }}</p>

            <h3 class="text-sm font-semibold mb-2">Connected apps</h3>
            <div
                v-if="isLoading"
                class="flex flex-col gap-2"
            >
                <Skeleton height="2.5rem" />
                <Skeleton height="2.5rem" />
            </div>
            <p
                v-else-if="isError"
                class="text-red-500"
                role="alert"
            >
                Could not load connected apps. Please try again later.
            </p>
            <ul
                v-else-if="list.length"
                class="list-none p-0 m-0 flex flex-col gap-2"
            >
                <li
                    v-for="conn in list"
                    :key="conn.id"
                    class="flex items-center justify-between gap-2"
                >
                    <div class="min-w-0">
                        <p class="font-medium truncate">{{ conn.clientName }}</p>
                        <p class="text-sm text-surface-600 dark:text-surface-300">
                            Connected {{ new Date(conn.createdAt).toLocaleDateString() }} &middot; Last used
                            {{ conn.lastUsedAt ? formatTimeAgo(conn.lastUsedAt) : "Never" }}
                        </p>
                    </div>
                    <Button
                        label="Revoke"
                        severity="danger"
                        text
                        class="shrink-0"
                        :disabled="revokeMutation.isPending.value"
                        @click="handleRevoke(conn.id, conn.clientName)"
                    />
                </li>
            </ul>
            <p
                v-else
                class="text-surface-600 dark:text-surface-300"
            >
                No apps connected yet.
            </p>
        </div>
    </SharedSectionBand>
</template>
