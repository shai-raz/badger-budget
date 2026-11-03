<script setup lang="ts">
import EditTransactionDialog from "./EditTransactionDialog.vue";
import MarkCardPayoff from "./MarkCardPayoff.vue";
import { useTransactionRowActions } from "../../composables/transactions/useTransactionRowActions";

const {
    menu,
    menuItems,
    selectedTransaction,
    showEditModal,
    showMarkCardPayoffModal,
    openMenu,
    openEdit,
    openCreateRuleFromEdit,
} = useTransactionRowActions();

// Parents call these to drive the shared chrome (menu + modals).
defineExpose({ openMenu, openEdit });
</script>

<template>
    <Menu
        ref="menu"
        :model="menuItems"
        popup
    >
        <template #item="{ item, props }">
            <span
                v-if="item.tooltip"
                v-tooltip.left="item.tooltip"
                class="pointer-events-auto block"
            >
                <a v-bind="props.action">
                    <span
                        v-if="item.icon"
                        :class="item.icon"
                    />
                    <span :class="props.label">{{ item.label }}</span>
                </a>
            </span>
            <a
                v-else
                v-bind="props.action"
            >
                <span
                    v-if="item.icon"
                    :class="item.icon"
                />
                <span :class="props.label">{{ item.label }}</span>
            </a>
        </template>
    </Menu>
    <EditTransactionDialog
        v-model:visible="showEditModal"
        :transaction="selectedTransaction"
        @create-rule="openCreateRuleFromEdit"
    />
    <MarkCardPayoff
        v-model:visible="showMarkCardPayoffModal"
        :transaction="selectedTransaction"
    />
</template>
