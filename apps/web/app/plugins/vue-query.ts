import { VueQueryPlugin, QueryClient, type VueQueryPluginOptions } from "@tanstack/vue-query";

export default defineNuxtPlugin((nuxtApp) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: 2,
                staleTime: 5 * 60 * 1000, // 5 minutes
                refetchOnWindowFocus: false,
            },
        },
    });

    const options: VueQueryPluginOptions = {
        queryClient,
    };

    nuxtApp.vueApp.use(VueQueryPlugin, options);
});
