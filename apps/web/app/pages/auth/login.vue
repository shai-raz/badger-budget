<script setup lang="ts">
import { computed, ref } from "vue";
import { sanitizeRedirectPath } from "~/utils/safeRedirect";
import { canShowRegister } from "~/utils/appConfig";
import { useInstanceConfig } from "~/composables/useInstanceConfig";
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const config = useInstanceConfig();
const showRegisterLink = computed(() => canShowRegister(config.data.value));
const otherAuthLink = computed(() => {
    const redirect = sanitizeRedirectPath(route.query.redirect);
    return redirect ? { path: "/auth/register", query: { redirect } } : "/auth/register";
});

const email = ref("");
const password = ref("");

const handleLogin = async () => {
    try {
        await authStore.login(email.value, password.value);
        router.push(sanitizeRedirectPath(route.query.redirect) ?? "/");
    } catch {
        // Error is handled in store
    }
};
</script>

<template>
    <div
        class="auth-page flex items-center justify-center min-h-screen bg-surface-50 dark:bg-surface-950 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))]"
    >
        <div class="auth-card-wrapper">
            <div class="mb-6 flex justify-center">
                <SharedBrandLogo
                    variant="stacked"
                    class="h-20 md:h-28"
                />
            </div>
            <Card class="w-full">
                <template #title>
                    <div class="text-center">
                        <h2>Login</h2>
                    </div>
                </template>
                <template #content>
                    <form
                        class="p-3 md:p-8"
                        @submit.prevent="handleLogin"
                    >
                        <div class="flex flex-col gap-4">
                            <div>
                                <!-- <label for="email">Email</label> -->
                                <InputText
                                    id="email"
                                    v-model="email"
                                    type="email"
                                    placeholder="Email address"
                                    class="w-full"
                                    required
                                />
                            </div>

                            <div>
                                <!-- <label for="password">Password</label> -->
                                <Password
                                    id="password"
                                    v-model="password"
                                    placeholder="Password"
                                    :feedback="false"
                                    toggle-mask
                                    class="w-full"
                                    input-class="w-full"
                                    required
                                />
                            </div>
                        </div>

                        <Message
                            v-if="authStore.error"
                            severity="error"
                            :closable="false"
                            class="mt-3"
                        >
                            {{ authStore.error }}
                        </Message>

                        <Button
                            type="submit"
                            label="Login"
                            class="w-full mt-3"
                            :loading="authStore.isLoading"
                        />
                    </form>
                </template>
                <template
                    v-if="showRegisterLink"
                    #footer
                >
                    <div class="text-center">
                        <p class="text-sm">
                            Don't have an account?
                            <NuxtLink
                                :to="otherAuthLink"
                                class="text-primary"
                                >Register</NuxtLink
                            >
                        </p>
                    </div>
                </template>
            </Card>
        </div>
    </div>
</template>

<style scoped>
.auth-page {
    height: 100svh;
}

.auth-card-wrapper {
    width: min(100%, 30rem);
    margin-inline: auto;
}

@media (max-width: 767px) {
    .auth-card-wrapper {
        width: 100%;
    }

    .auth-card-wrapper :deep(.p-card) {
        background: transparent;
        border: none;
        box-shadow: none;
    }

    .auth-card-wrapper :deep(.p-card-body) {
        padding: 0;
    }
}
</style>
