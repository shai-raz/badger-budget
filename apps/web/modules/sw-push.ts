import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { defineNuxtModule } from "nuxt/kit";

// Bundles sw/sw-push.ts into sw-push.js and serves it from the site root, where the generated worker imports it
// (workbox.importScripts in nuxt.config.ts).
export default defineNuxtModule({
    meta: { name: "sw-push" },
    setup(_, nuxt) {
        // The nuxt test environment does not run the PWA module either, so there is no worker to feed.
        if (process.env.VITEST) return;

        const outDir = resolve(nuxt.options.rootDir, ".sw-push");
        mkdirSync(outDir, { recursive: true });
        nuxt.options.nitro.publicAssets ||= [];
        nuxt.options.nitro.publicAssets.push({ dir: outDir, baseURL: "/", maxAge: 0 });

        // build:before, not a Nitro hook: vite-pwa globs the precache in nitro:build:public-assets, which runs after
        // nitro copies publicAssets, so the file must exist before the build starts.
        nuxt.hook("build:before", async () => {
            await build({
                entryPoints: [resolve(nuxt.options.rootDir, "sw/sw-push.ts")],
                outfile: resolve(outDir, "sw-push.js"),
                bundle: true,
                format: "iife",
                platform: "browser",
                target: "es2020",
                minify: !nuxt.options.dev,
                // shared-data exposes its TS source under the "module" condition, so the worker needs no dist build.
                conditions: ["module"],
                legalComments: "none",
            });
        });
    },
});
