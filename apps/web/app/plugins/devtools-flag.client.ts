import { useDevtoolsFlag } from "../composables/useDevtoolsFlag";
import { applyDevtoolsQuery, browserLocalStorage } from "../utils/devtoolsFlag";

// Runs on every navigation, so a `?devtools=` link works from any page.
export default defineNuxtPlugin(() => {
    const router = useRouter();
    const enabled = useDevtoolsFlag();

    const apply = (query: unknown) => {
        const next = applyDevtoolsQuery(query, browserLocalStorage());
        if (next !== null) enabled.value = next;
    };

    apply(router.currentRoute.value.query);
    router.afterEach((to) => apply(to.query));
});
