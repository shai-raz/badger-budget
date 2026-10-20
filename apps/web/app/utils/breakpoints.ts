import { breakpointsTailwind } from "@vueuse/core";

/**
 * Media-query width for "below Tailwind `md`" (767.9px), for APIs that take a
 * `max-width` string, such as PrimeVue's `breakpoints` props. Same value as
 * VueUse `useBreakpoints(breakpointsTailwind).smaller("md")`: the `-0.1` keeps
 * it from overlapping Tailwind's `md:` (`min-width: 768px`) at exactly 768px.
 */
export const BELOW_MD = `${breakpointsTailwind.md - 0.1}px`;
