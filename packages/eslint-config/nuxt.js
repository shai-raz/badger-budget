import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import onlyWarn from "eslint-plugin-only-warn";

/**
 * Extra ESLint layers to append after Nuxt's generated config
 * (`withNuxt(...config)`). Nuxt already provides the JS/TS/Vue
 * recommended rules, so this only adds the repo-wide concerns.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
    eslintConfigPrettier,
    {
        plugins: {
            turbo: turboPlugin,
        },
        rules: {
            "turbo/no-undeclared-env-vars": "warn",
        },
    },
    {
        plugins: {
            onlyWarn,
        },
    },
];
