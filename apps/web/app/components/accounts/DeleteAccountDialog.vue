<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import type { AccountRuleOutcome } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";

interface Props {
    visible: boolean;
    account: IAccountResponse | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ "update:visible": [value: boolean] }>();

const toast = useToast();
const deleteMutation = useDeleteAccount();

const {
    data: usage,
    isFetching: loadingUsage,
    isError: usageError,
} = useAccountRuleUsageQuery(
    () => props.account?.id,
    () => props.visible,
);

const deleting = ref(false);

const rules = computed(() => usage.value?.rules ?? []);
const ruleCount = computed(() => rules.value.length);

const title = computed(() => `Delete "${props.account?.name ?? ""}"?`);
const affectedLead = computed(() =>
    ruleCount.value === 1
        ? "1 rule uses this account and will change:"
        : `${ruleCount.value} rules use this account and will change:`,
);

// Delete waits for the usage: until it has loaded, and never on a failed load, it could delete rules unseen.
const confirmDisabled = computed(() => deleting.value || loadingUsage.value || usageError.value || !usage.value);

const tagFor = (outcome: AccountRuleOutcome) =>
    outcome === "rule_deleted"
        ? { tone: "danger" as const, value: "Rule deleted" }
        : { tone: "neutral" as const, value: "Condition removed" };

const handleClose = () => emit("update:visible", false);

const handleConfirm = async () => {
    if (!props.account) return;
    deleting.value = true;
    try {
        await deleteMutation.mutateAsync(props.account.id);
        toast.add({
            severity: "success",
            summary: "Success",
            detail: "Account deleted successfully",
            life: 3000,
        });
        handleClose();
    } catch (error) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(error, "Failed to delete account"),
            life: 5000,
        });
    } finally {
        deleting.value = false;
    }
};
</script>

<template>
    <Dialog
        :visible="visible"
        class="dialog-compact max-w-[95vw] md:max-w-[480px]"
        modal
        :header="title"
        :style="{ width: '30rem' }"
        @update:visible="emit('update:visible', $event)"
    >
        <div
            v-if="account"
            class="flex flex-col gap-4"
        >
            <p class="text-sm">This can't be undone.</p>

            <Message
                v-if="usageError"
                severity="error"
                :closable="false"
            >
                Couldn't load the rules this account uses.
            </Message>

            <div
                v-else-if="ruleCount > 0"
                class="flex flex-col gap-3"
            >
                <p class="text-sm">{{ affectedLead }}</p>

                <ul
                    tabindex="0"
                    aria-label="Rules that will change"
                    class="max-h-[200px] divide-y divide-surface-200 overflow-y-auto rounded-md border border-surface-200 dark:divide-surface-700 dark:border-surface-700"
                >
                    <li
                        v-for="rule in rules"
                        :key="rule.id"
                        class="flex items-center justify-between gap-3 px-3 py-2"
                    >
                        <span class="min-w-0 truncate text-sm">{{ rule.name }}</span>
                        <SharedStatusTag
                            class="shrink-0"
                            :tone="tagFor(rule.outcome).tone"
                            :value="tagFor(rule.outcome).value"
                        />
                    </li>
                </ul>

                <p class="text-muted-color text-xs">A rule with no other conditions is deleted.</p>
            </div>
        </div>

        <template #footer>
            <Button
                label="Cancel"
                text
                :disabled="deleting"
                @click="handleClose"
            />
            <Button
                label="Delete account"
                severity="danger"
                :disabled="confirmDisabled"
                :loading="deleting"
                @click="handleConfirm"
            />
        </template>
    </Dialog>
</template>
