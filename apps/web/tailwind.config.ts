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
    theme: {
        extend: {
            // These follow the active theme's tokens: `text-primary` comes from
            // tailwindcss-primeui (var(--p-primary-color)), and `income`/`expense`
            // read the preset's amount tokens. The vars are opaque, so `/opacity`
            // modifiers (e.g. `text-income/50`) don't work on them.
            colors: {
                income: {
                    DEFAULT: "var(--p-amount-income)",
                    strong: "var(--p-amount-income-strong)",
                },
                expense: "var(--p-amount-expense)",
            },
        },
    },
    darkMode: "class",
    plugins: [PrimeUI],
} satisfies Config;
