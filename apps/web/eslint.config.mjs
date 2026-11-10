import withNuxt from "./.nuxt/eslint.config.mjs";
import { config as repoConfig } from "@repo/eslint-config/nuxt";

export default withNuxt(...repoConfig, {
    // Bundled output of modules/sw-push.ts (esbuild), not source.
    ignores: [".sw-push/**"],
});
