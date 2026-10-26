import { customAuraPreset } from "./app/theme/preset";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "./app/utils/theme";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    devtools: { enabled: true },
    compatibilityDate: "2024-04-03",
    modules: [
        "@nuxt/eslint",
        "@pinia/nuxt",
        "@primevue/nuxt-module",
        "@nuxtjs/tailwindcss",
        "@peterbud/nuxt-query",
        "@vueuse/nuxt",
        // Skipped under vitest: its client plugin imports a virtual module that the nuxt test env cannot resolve.
        ...(process.env.VITEST ? [] : ["@vite-pwa/nuxt"]),
    ],

    ssr: false,

    // Frame-blocking headers are set by the API (apps/api/src/config/spa.ts), which serves the built SPA on the
    // same origin, so they cover every route, including /oauth/consent.
    nitro: {
        // `pnpm dev:web` stays same-origin: /api and /.well-known go to the local API. Nitro strips the matched
        // prefix, so the target keeps it.
        devProxy: {
            "/api": { target: "http://localhost:3000/api", changeOrigin: true },
            "/.well-known": { target: "http://localhost:3000/.well-known", changeOrigin: true },
        },
    },
    css: ["primeicons/primeicons.css"],
    runtimeConfig: {
        public: {
            // Relative by default, so the API is reached on the page's own origin. Inlined at build time
            // (`nuxt build` / `nuxt generate`), so overriding NUXT_PUBLIC_API_BASE_URL needs a web rebuild.
            apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "/api/v1",
        },
    },
    devServer: {
        port: 3001,
    },

    /* Modules Config */

    primevue: {
        options: {
            theme: {
                preset: customAuraPreset,
                options: {
                    darkModeSelector: ".dark",
                    // PrimeVue's styled-mode CSS is injected into <style> tags at
                    // runtime, so in a production build it lands after the bundled
                    // Tailwind stylesheet while dev injects Tailwind last. Scoping
                    // it to a `primevue` layer that sits below `tailwind-utilities`
                    // makes utility classes win in both modes. The layer order is
                    // also declared in app/assets/css/tailwind.css.
                    cssLayer: {
                        name: "primevue",
                        order: "tailwind-base, primevue, tailwind-utilities",
                    },
                },
            },
            // Global pt: Card has no border token, so the 1px border in the
            // app-wide card look (see apps/web/DESIGN.md > Surfaces) is
            // merged in here instead of per-instance. mergeSections/mergeProps
            // keep this additive with any component-level pt/class.
            pt: {
                card: {
                    root: { class: "border border-surface-200 dark:border-surface-700" },
                },
                dialog: {
                    // Fullscreen below md, except ConfirmDialog and `dialog-compact` opt-outs (see ARCHITECTURE.md > Dialogs).
                    root: {
                        class: "max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!w-full max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!max-w-full max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!h-full max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!max-h-full max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!m-0 max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!rounded-none max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!border-0 max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!shadow-none max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!pt-[env(safe-area-inset-top)] max-md:[&:not(.p-confirmdialog):not(.dialog-compact)]:!pb-[env(safe-area-inset-bottom)]",
                    },
                    content: { class: "max-md:grow" },
                    // Page-title colour; compact dialogs and ConfirmDialog step down to text-lg.
                    title: {
                        class: "text-surface-900 dark:text-surface-0 [.dialog-compact_&]:text-lg [.p-confirmdialog_&]:text-lg",
                    },
                },
            },
            ptOptions: {
                mergeSections: true,
                mergeProps: true,
            },
        },
    },

    tailwindcss: {
        cssPath: "~/assets/css/tailwind.css",
        exposeConfig: true,
    },

    nuxtQuery: {
        autoImports: ["useQuery", "useMutation"],
    },

    app: {
        head: {
            link: [{ rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" }],
            meta: [
                // Replaced at runtime by plugins/theme.client.ts (useHead) and the init script below.
                { name: "theme-color", content: THEME_COLOR.light },
                // viewport-fit=cover enables env(safe-area-inset-*), used by AppBottomBar, the app-shell and the fullscreen dialog pt.
                { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
            ],
            // Applies the saved/OS theme before first paint; must match stores/theme.ts via utils/theme.ts.
            script: [{ innerHTML: THEME_INIT_SCRIPT, tagPosition: "head" }],
        },
    },

    pwa: {
        registerType: "autoUpdate",
        manifest: {
            name: "Badger Budget",
            short_name: "Badger",
            description: "Personal finance and budgeting app",
            // Static on purpose: a manifest cannot follow the in-app theme choice.
            theme_color: "#1F2022",
            background_color: "#1F2022",
            display: "standalone",
            start_url: "/",
            icons: [
                {
                    src: "pwa-192x192.png",
                    sizes: "192x192",
                    type: "image/png",
                },
                {
                    src: "pwa-512x512.png",
                    sizes: "512x512",
                    type: "image/png",
                },
                {
                    src: "maskable-icon-512x512.png",
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "maskable",
                },
            ],
        },
        workbox: {
            globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
            // SPA fallback for offline navigation; never intercept API calls
            navigateFallback: "/",
            // /oauth/ must come from the network so it carries the frame-blocking headers
            navigateFallbackDenylist: [/^\/api\//, /^\/oauth\//, /^\/\.well-known\//],
        },
        devOptions: {
            enabled: false,
        },
    },
});
