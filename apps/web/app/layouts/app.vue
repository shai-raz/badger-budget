<script setup lang="ts">
import AppBottomBar from "~/components/layout/AppBottomBar.vue";
import AppSidebar from "~/components/layout/AppSidebar.vue";
import NavDrawer from "~/components/layout/NavDrawer.vue";
import UpdateDialog from "~/components/layout/UpdateDialog.vue";
import BudgetFormDialog from "~/components/budgets/BudgetFormDialog.vue";
import CashFollowupToast from "~/components/transactions/CashFollowupToast.vue";
import ReimbursementPickerDialog from "~/components/transactions/ReimbursementPickerDialog.vue";

// `definePageMeta({ fullBleed: true })` opts a page out of the scroller's
// mobile padding so its sections can span the full screen width (see below).
const route = useRoute();

// Below md, the toast spans the screen with 1rem gutters instead of its fixed
// 25rem top-right box. PrimeVue turns this into a `max-width` media query.
// `width` must be set explicitly, because the theme's fixed 25rem would
// otherwise win over left/right.
const toastBreakpoints = {
    [BELOW_MD]: { width: "calc(100vw - 2rem)", left: "1rem", right: "1rem" },
};

// Locks document scroll and overscroll only while this layout is mounted
// (unhead removes the class on auth pages). It goes on <body> rather than
// <html> because stores/theme.ts toggles `.dark` on <html> via classList.
useHead({ bodyAttrs: { class: "app-layout-body" } });
</script>

<template>
    <div class="app-shell flex flex-col bg-surface-0 dark:bg-surface-900">
        <div class="flex flex-1 overflow-hidden">
            <div class="hidden md:flex">
                <AppSidebar />
            </div>

            <div class="flex-1 flex flex-col overflow-hidden">
                <!-- Teleport target for LayoutPageHeader: sits above the scroller, unaffected by the
                     page padding below. Painted so the strip is never the raw (black)
                     browser canvas when a header is present. -->
                <div
                    id="page-top-bar"
                    class="shrink-0 bg-surface-0 dark:bg-surface-900"
                ></div>
                <!-- Padding lives on the scroller itself, not an inner wrapper: a
                     page can then take h-full for exactly the scroller's content
                     box (which already excludes this padding) to get a
                     pinned-header + inner-scroll layout, while a taller page just
                     overflows the scroller normally and still gets the same
                     padding after its last element. A clamped inner wrapper can't
                     do both — its bottom padding sits at its own edge, and any
                     content taller than that edge spills straight past it.
                     The padding is uniform: AppBottomBar is in flow, so there is
                     no fixed bar left to clear.
                     A `fullBleed` page drops it below md so the page can run its
                     own sections edge to edge (separated by borders instead of
                     gaps); desktop keeps the padded, card-based layout. -->
                <div
                    class="flex-1 overflow-y-auto overscroll-y-contain bg-surface-50 dark:bg-surface-950"
                    :class="route.meta.fullBleed ? 'md:p-4' : 'p-4'"
                >
                    <slot />
                    <Toast :breakpoints="toastBreakpoints" />
                    <CashFollowupToast />
                    <ConfirmDialog :pt="{ message: { class: 'whitespace-pre-line' } }" />
                </div>
            </div>
        </div>

        <AppBottomBar class="md:hidden" />
        <NavDrawer />
        <UpdateDialog />
        <BudgetFormDialog />
        <ReimbursementPickerDialog />
    </div>
</template>

<style scoped>
/* Dynamic viewport: 100vh is the *large* viewport on mobile, so with a browser toolbar showing the shell overflowed and the document scrolled the bottom bar away (#153/#154). 100vh is the fallback for browsers without dvh. Bespoke unlayered class on purpose: `h-screen h-dvh` doesn't work because Tailwind emits .h-dvh before .h-screen. Side/top safe-area padding keeps content clear of notches under viewport-fit=cover (0 elsewhere); the bottom inset is padded by AppBottomBar itself. */
.app-shell {
    height: 100vh;
    height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
}
</style>
