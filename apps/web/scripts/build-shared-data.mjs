// Web's postinstall runs this before `nuxt prepare`: nuxt.config.ts (directly and via app/utils/theme.ts) imports
// runtime values from @badger/shared-data, whose entry is the compiled dist/, so a fresh clone must build it first.
// Only shared-data: the config's other workspace imports are type-only. Add a package here if that changes.
// Skipped when the sources are absent: the Dockerfile's dependency layer installs with only the package.json files
// (and no nuxt.config.ts); its later `turbo run generate` builds shared-data through ^build.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const tsconfig = new URL("../../../packages/shared-data/tsconfig.json", import.meta.url);

if (existsSync(tsconfig)) {
    execSync("pnpm --filter @badger/shared-data build", { stdio: "inherit" });
} else {
    console.log("build-shared-data: packages/shared-data sources not present, skipping");
}
