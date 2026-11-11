import { browserLocalStorage, readDevtoolsFlag } from "~/utils/devtoolsFlag";

/** Whether developer options are shown on this browser. Set by `?devtools=1|0` (see plugins/devtools-flag.client.ts). */
export const useDevtoolsFlag = () =>
    useState<boolean>("devtools-enabled", () => readDevtoolsFlag(browserLocalStorage()));
