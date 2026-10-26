import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadToNewBuild, type ReloadContainer, type ReloadRegistration } from "./reloadToNewBuild";

/** Minimal stand-in for ServiceWorkerContainer: only the members reloadToNewBuild uses. */
class FakeContainer extends EventTarget implements ReloadContainer {
    constructor(private readonly registration: FakeRegistration | undefined) {
        super();
    }

    getRegistration(): Promise<FakeRegistration | undefined> {
        return Promise.resolve(this.registration);
    }

    /** Simulates the browser swapping the controlling worker. */
    takeOver(): void {
        this.dispatchEvent(new Event("controllerchange"));
    }
}

interface FakeRegistration extends ReloadRegistration {
    installing: object | null;
    waiting: object | null;
    update: ReturnType<typeof vi.fn<() => Promise<void>>>;
    unregister: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
}

function fakeRegistration(overrides: Partial<FakeRegistration> = {}): FakeRegistration {
    return {
        installing: null,
        waiting: null,
        update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        unregister: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
        ...overrides,
    };
}

const newWorker = { state: "installing" };

describe("reloadToNewBuild", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reloads once when there is no service worker container", async () => {
        const reload = vi.fn();
        await reloadToNewBuild(undefined, reload);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads when the container has no registration", async () => {
        const reload = vi.fn();
        await reloadToNewBuild(new FakeContainer(undefined), reload);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads without waiting when the update finds no new worker", async () => {
        const registration = fakeRegistration();
        const reload = vi.fn();
        await reloadToNewBuild(new FakeContainer(registration), reload);
        expect(registration.update).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(registration.unregister).not.toHaveBeenCalled();
    });

    it("reloads after the controller changes when a new worker is installing", async () => {
        const registration = fakeRegistration({ installing: newWorker });
        const container = new FakeContainer(registration);
        const reload = vi.fn();

        const done = reloadToNewBuild(container, reload);
        await vi.advanceTimersByTimeAsync(0);
        expect(reload).not.toHaveBeenCalled();

        container.takeOver();
        await done;
        expect(reload).toHaveBeenCalledTimes(1);
        expect(registration.unregister).not.toHaveBeenCalled();
    });

    it("unregisters and then reloads when the new worker never takes over", async () => {
        const registration = fakeRegistration({ waiting: newWorker });
        const reload = vi.fn();

        const done = reloadToNewBuild(new FakeContainer(registration), reload, 15_000);
        await vi.advanceTimersByTimeAsync(14_999);
        expect(registration.unregister).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(registration.unregister).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("still reloads when update() rejects", async () => {
        const registration = fakeRegistration({
            update: vi.fn<() => Promise<void>>(() => Promise.reject(new Error("offline"))),
        });
        const reload = vi.fn();
        await reloadToNewBuild(new FakeContainer(registration), reload);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
