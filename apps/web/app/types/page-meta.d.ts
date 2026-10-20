// Custom `definePageMeta` keys. Nuxt merges `PageMeta` into vue-router's
// `RouteMeta`, so declaring a key here types it on both `definePageMeta({ ... })`
// and `route.meta.*`.
declare module "#app" {
    interface PageMeta {
        /**
         * Drop the app layout's scroller padding below `md` so the page can run
         * its sections edge to edge. Desktop keeps the standard `p-4` gutter.
         */
        fullBleed?: boolean;
    }
}

// A module augmentation file needs at least one import/export to be treated as
// a module rather than a global script.
export {};
