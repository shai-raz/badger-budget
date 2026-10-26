/** The parts of a service worker registration the reload needs. */
export interface ReloadRegistration {
    readonly installing: unknown;
    readonly waiting: unknown;
    update(): Promise<unknown>;
    unregister(): Promise<boolean>;
}

/** The parts of ServiceWorkerContainer the reload needs. */
export interface ReloadContainer {
    getRegistration(): Promise<ReloadRegistration | undefined>;
    addEventListener(type: "controllerchange", listener: () => void, options?: { once?: boolean }): void;
}

/**
 * Reloads this tab onto the newest build, past the service worker.
 *
 * Call only from the user's Reload action, never while polling: the autoUpdate plugin reloads every tab
 * when a new service worker activates, so an early update check would reload tabs the user did not ask about.
 *
 * The plugin also reloads on activation, which can land the old build first; swapping the worker before the
 * reload makes the navigation hit the new precache. If the new worker never takes over, it is unregistered
 * so the reload goes to the network.
 */
export async function reloadToNewBuild(
    container: ReloadContainer | undefined = globalThis.navigator?.serviceWorker,
    reload: () => void = () => window.location.reload(),
    timeoutMs = 15_000,
): Promise<void> {
    const registration = await container?.getRegistration().catch(() => undefined);
    if (container && registration) {
        const swapped = new Promise<boolean>((resolve) =>
            container.addEventListener("controllerchange", () => resolve(true), { once: true }),
        );
        // Re-fetches sw.js (served no-cache) and starts installing a new worker when it differs.
        await registration.update().catch(() => undefined);
        if (registration.installing || registration.waiting) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timedOut = new Promise<boolean>((resolve) => {
                timer = setTimeout(() => resolve(false), timeoutMs);
            });
            const tookOver = await Promise.race([swapped, timedOut]);
            clearTimeout(timer);
            // Install failed or is too slow: drop the old worker so the reload fetches the new index.html.
            if (!tookOver) await registration.unregister().catch(() => undefined);
        }
    }
    reload();
}
