<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { sanitizeRedirectPath } from "~/utils/safeRedirect";
import { shouldLeaveRegisterPage } from "~/utils/appConfig";
import { appConfigKeys, useInstanceConfig } from "~/composables/useInstanceConfig";
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();
const config = useInstanceConfig();
const otherAuthLink = computed(() => {
    const redirect = sanitizeRedirectPath(route.query.redirect);
    return redirect ? { path: "/auth/login", query: { redirect } } : "/auth/login";
});

// Registration closed on this instance: send the visitor to login instead of showing a form that would 403.
watch(
    () => config.data.value,
    (appConfig) => {
        if (shouldLeaveRegisterPage(appConfig)) {
            navigateTo(otherAuthLink.value, { replace: true });
        }
    },
    { immediate: true },
);

const email = ref("");
const password = ref("");
const firstName = ref("");
const lastName = ref("");

const handleRegister = async () => {
    console.log("[PAGE] Register button clicked");
    console.log("[PAGE] Form values:", {
        email: email.value,
        firstName: firstName.value,
        lastName: lastName.value,
        passwordLength: password.value.length,
    });

    try {
        await authStore.register(email.value, password.value, firstName.value, lastName.value);
        console.log("[PAGE] Registration successful, redirecting...");
        // The first account can close registration, so the cached flag is stale now
        queryClient.invalidateQueries({ queryKey: appConfigKeys.all });
        router.push(sanitizeRedirectPath(route.query.redirect) ?? "/");
    } catch (error) {
        console.error("[PAGE] Registration error:", error);
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
                        <h2>Register</h2>
                    </div>
                </template>
                <template #content>
                    <form
                        class="p-8 flex flex-col gap-4"
                        @submit.prevent="handleRegister"
                    >
                        <div class="flex flex-col gap-2">
                            <label for="firstName">First Name</label>
                            <InputText
                                id="firstName"
                                v-model="firstName"
                                placeholder="Enter your first name"
                                class="w-full"
                                required
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label for="lastName">Last Name</label>
                            <InputText
                                id="lastName"
                                v-model="lastName"
                                placeholder="Enter your last name"
                                class="w-full"
                                required
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label for="email">Email</label>
                            <InputText
                                id="email"
                                v-model="email"
                                type="email"
                                placeholder="Enter your email"
                                class="w-full"
                                required
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label for="password">Password</label>
                            <Password
                                id="password"
                                v-model="password"
                                placeholder="Enter your password"
                                toggle-mask
                                class="w-full"
                                input-class="w-full"
                                required
                            />
                        </div>

                        <Message
                            v-if="authStore.error"
                            severity="error"
                            :closable="false"
                        >
                            {{ authStore.error }}
                        </Message>

                        <Button
                            type="submit"
                            label="Register"
                            class="w-full mt-3"
                            :loading="authStore.isLoading"
                        />
                    </form>
                </template>
                <template #footer>
                    <div class="text-center">
                        <p class="text-sm">
                            Already have an account?
                            <NuxtLink
                                :to="otherAuthLink"
                                class="text-primary"
                                >Login</NuxtLink
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
    min-height: 100vh;
}

.auth-card-wrapper {
    width: min(100%, 30rem);
    margin-inline: auto;
}
</style>
