import { breakpointsTailwind } from "@vueuse/core";

/** Viewport is at or above Tailwind's `md` breakpoint (768px, from VueUse's `breakpointsTailwind`). */
export const useIsDesktop = () => useBreakpoints(breakpointsTailwind).greaterOrEqual("md");
