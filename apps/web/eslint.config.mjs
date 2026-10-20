import withNuxt from "./.nuxt/eslint.config.mjs";
import { config as repoConfig } from "@repo/eslint-config/nuxt";

export default withNuxt(...repoConfig);
