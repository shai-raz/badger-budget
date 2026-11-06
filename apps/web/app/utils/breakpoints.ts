import { breakpointsTailwind } from "@vueuse/core";

/**
 * Media-query width for "below Tailwind `md`" (767.9px), for APIs that take a
 * `max-width` string, such as PrimeVue's `breakpoints` props. Same value as
 * VueUse `useBreakpoints(breakpointsTailwind).smaller("md")`: the `-0.1` keeps
 * it from overlapping Tailwind's `md:` (`min-width: 768px`) at exactly 768px.
 */
export const BELOW_MD = `${breakpointsTailwind.md - 0.1}px`;

/**
 * The transactions toolbar fits one row from here. Below it (down to md) the
 * pickers scroll in a row beside a Filters button.
 */
export const TRANSACTIONS_TOOLBAR_FULL = "(min-width: 1150px)";
