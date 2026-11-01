<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import { isLedgerAccountType } from "@badger/shared-data";
import { accountRowSubtitle, getBalanceDisplay } from "~/utils/accountBalance";
import { formatCurrency } from "~/utils/currency";
import { formatTimeAgoCompact, isStale } from "~/utils/relativeTime";
import { accountFallbackIcon } from "~/utils/avatarIcons";

/**
 * One account row, mobile. Overview and the Accounts page share it. An account with no balance
 * still renders: its caption stands in for the balance. `manageable` shows the ⋮ button; the parent
 * owns the menu it opens (and then the Update balance action lives in that menu, not on the row).
 */
const props = withDefaults(
    defineProps<{
        account: IAccountResponse;
        manageable?: boolean;
    }>(),
    { manageable: false },
);

const emit = defineEmits<{
    updateCash: [];
    menuToggle: [payload: { account: IAccountResponse; event: Event }];
}>();

// Ticks every minute so the compact sync labels / staleness stay current.
const now = useNow({ interval: 60_000 });

const display = computed(() => getBalanceDisplay(props.account));

const subtitle = computed(() => accountRowSubtitle(props.account, props.manageable));

const stale = computed(() =>
    props.account.balanceUpdatedAt ? isStale(props.account.balanceUpdatedAt, now.value) : false,
);

const handleMenu = (event: Event) => emit("menuToggle", { account: props.account, event });
</script>

<template>
    <div class="flex flex-col gap-2 px-4 py-3">
        <div class="flex items-center gap-3">
            <SharedEntityAvatar
                :icon="account.icon"
                :color="account.color"
                :fallback="accountFallbackIcon(account.type)"
            />
            <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{{ account.name }}</p>
                <p class="truncate text-xs text-muted-color">{{ subtitle }}</p>
            </div>
            <div
                v-if="display"
                class="shrink-0 text-right"
            >
                <p
                    v-if="display.kind === 'cash_on_hand' && !display.balanceSet"
                    class="text-sm font-semibold text-muted-color"
                >
                    Balance not set
                </p>
                <p
                    v-else
                    class="font-semibold tabular-nums"
                    :class="display.tone === 'negative' ? 'text-expense' : ''"
                >
                    {{ formatCurrency(display.amount, account.currency?.code) }}
                </p>
                <p
                    v-if="account.balanceUpdatedAt"
                    class="flex items-center justify-end gap-1 text-[11px]"
                    :class="stale ? 'text-amber-600' : 'text-muted-color'"
                >
                    <i
                        v-if="stale"
                        class="pi pi-exclamation-circle"
                    ></i>
                    {{ formatTimeAgoCompact(account.balanceUpdatedAt, now) }}
                </p>
                <Button
                    v-if="isLedgerAccountType(account.type) && !manageable"
                    label="Update"
                    icon="pi pi-pencil"
                    size="small"
                    text
                    class="-mr-2"
                    @click="emit('updateCash')"
                />
            </div>
            <Button
                v-if="manageable"
                icon="pi pi-ellipsis-v"
                text
                rounded
                size="small"
                aria-label="Account actions"
                class="shrink-0 text-muted-color"
                @click="handleMenu"
            />
        </div>

        <div
            v-if="display?.kind === 'utilized_credit' && display.limit"
            class="flex flex-col gap-1"
        >
            <ProgressBar
                :value="Math.min(display.utilizationPct ?? 0, 100)"
                :show-value="false"
                :dt="{ height: '6px', borderRadius: '9999px' }"
            />
            <p class="text-xs text-muted-color">{{ display.utilizationPct }}% of limit</p>
        </div>
    </div>
</template>
