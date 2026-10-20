<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import { accountCaption, getBalanceDisplay, formatChargeLine } from "~/utils/accountBalance";
import { formatCurrency } from "~/utils/currency";
import { formatTimeAgo, isStale } from "~/utils/relativeTime";
import { accountFallbackIcon } from "~/utils/avatarIcons";

const props = withDefaults(
    defineProps<{
        account: IAccountResponse;
        // Shows the ⋮ button; the parent owns the menu it opens.
        manageable?: boolean;
    }>(),
    { manageable: false },
);

const emit = defineEmits<{
    updateCash: [];
    menuToggle: [payload: { account: IAccountResponse; event: Event }];
}>();

// Ticks every minute so "Synced N ago" / staleness stay current on an open dashboard.
const now = useNow({ interval: 60_000 });

const display = computed(() => getBalanceDisplay(props.account));

const subtypeCaption = computed(() => accountCaption(props.account, props.manageable));

const handleMenu = (event: Event) => emit("menuToggle", { account: props.account, event });

const stale = computed(() =>
    props.account.balanceUpdatedAt ? isStale(props.account.balanceUpdatedAt, now.value) : false,
);
</script>

<template>
    <Card
        class="h-full"
        :pt="{ body: { class: 'h-full' }, content: { class: 'flex h-full flex-col' } }"
    >
        <template #content>
            <div class="flex items-center gap-3">
                <SharedEntityAvatar
                    :icon="account.icon"
                    :color="account.color"
                    :fallback="accountFallbackIcon(account.type)"
                />
                <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{{ account.name }}</p>
                    <p class="text-xs text-muted-color">{{ subtypeCaption }}</p>
                </div>
                <Button
                    v-if="manageable"
                    icon="pi pi-ellipsis-v"
                    text
                    rounded
                    size="small"
                    aria-label="Account actions"
                    class="-mr-2 -mt-1 shrink-0 text-muted-color"
                    @click="handleMenu"
                />
            </div>

            <template v-if="display">
                <p class="mt-3 text-xs text-muted-color">{{ display.label }}</p>
                <p
                    v-if="display.kind === 'cash_on_hand' && !display.balanceSet"
                    class="text-xl font-semibold text-muted-color"
                >
                    Balance not set
                </p>
                <p
                    v-else
                    class="text-xl font-semibold tabular-nums"
                    :class="display.tone === 'negative' ? 'text-rose-500' : ''"
                >
                    {{ formatCurrency(display.amount, account.currency?.code) }}
                </p>

                <p
                    v-if="display.kind === 'next_charge' && display.chargeDate"
                    class="text-xs text-muted-color"
                >
                    {{ formatChargeLine(display.chargeDate) }}
                </p>

                <template v-if="display.kind === 'utilized_credit' && display.limit">
                    <ProgressBar
                        :value="Math.min(display.utilizationPct ?? 0, 100)"
                        :show-value="false"
                        :dt="{ height: '6px', borderRadius: '9999px' }"
                        class="mt-2"
                    />
                    <p class="mt-1 text-xs text-muted-color">
                        of {{ formatCurrency(display.limit, account.currency?.code) }} limit ·
                        {{ display.utilizationPct }}%
                    </p>
                </template>

                <Button
                    v-if="display.kind === 'cash_on_hand' && !manageable"
                    label="Update"
                    icon="pi pi-pencil"
                    size="small"
                    outlined
                    class="mt-auto self-start"
                    @click="emit('updateCash')"
                />
            </template>

            <p
                v-if="account.balanceUpdatedAt"
                class="mt-auto flex items-center gap-1 pt-3 text-xs"
                :class="stale ? 'text-amber-600' : 'text-muted-color'"
            >
                <i
                    v-if="stale"
                    class="pi pi-exclamation-circle"
                ></i>
                Synced {{ formatTimeAgo(account.balanceUpdatedAt, now) }}
            </p>
        </template>
    </Card>
</template>
