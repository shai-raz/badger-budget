import type { Config } from "tailwindcss";
import PrimeUI from "tailwindcss-primeui";

export default {
    content: [
        "./components/**/*.{js,vue,ts}",
        "./layouts/**/*.vue",
        "./pages/**/*.vue",
        "./plugins/**/*.{js,ts}",
        "./app.vue",
        // Scanned for the global PrimeVue `pt` class strings (e.g. the Card
        // border in nuxt.config.ts) which live outside components/pages/layouts.
        "./nuxt.config.ts",
    ],
    // No colour overrides: `text-primary` comes from tailwindcss-primeui
    // (var(--p-primary-color)) so it follows the active scheme.
    darkMode: "class",
    plugins: [PrimeUI],
} satisfies Config;
