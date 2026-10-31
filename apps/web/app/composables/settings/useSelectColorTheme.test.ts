import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "~/stores/auth";
import { useThemeStore } from "~/stores/theme";
import { useSelectColorTheme } from "./useSelectColorTheme";

const { apiClient, toastAdd } = vi.hoisted(() => ({
    apiClient: { updateMe: vi.fn() },
    toastAdd: vi.fn(),
}));

type SaveContext = { prev: string; next: string; seq: number };
type MutationOptions = {
    mutationFn: (name: string) => Promise<IAuthUser>;
    onMutate: (name: string) => SaveContext;
    onSuccess: (user: IAuthUser, name: string, ctx: SaveContext) => void;
    onError: (err: unknown, name: string, ctx: SaveContext | undefined) => void;
};

// Runs the mutation the way TanStack Query does: onMutate first, then the request, then onSuccess or onError.
let options: MutationOptions;
const mutate = vi.fn((name: string) => {
    const ctx = options.onMutate(name);
    options
        .mutationFn(name)
        .then((user) => options.onSuccess(user, name, ctx))
        .catch((err: unknown) => options.onError(err, name, ctx));
});

vi.mock("@tanstack/vue-query", () => ({
    useMutation: (opts: MutationOptions) => {
        options = opts;
        return { mutate, isPending: { value: false } };
    },
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock("../useApiClient", () => ({ useApiClient: () => apiClient }));

const baseUser = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    role: "USER",
    colorTheme: "noir",
    isDemo: false,
} satisfies IAuthUser;

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useThemeStore().colorTheme = "noir";
    useAuthStore().user = { ...baseUser };
});

describe("useSelectColorTheme", () => {
    it("applies the pick at once, saves it with updateMe and stores the returned user", async () => {
        const saved = { ...baseUser, colorTheme: "ocean" } satisfies IAuthUser;
        apiClient.updateMe.mockResolvedValue(saved);
        const { select } = useSelectColorTheme();

        select("ocean");

        expect(useThemeStore().colorTheme).toBe("ocean");
        expect(apiClient.updateMe).toHaveBeenCalledWith({ colorTheme: "ocean" });
        await settle();
        expect(useAuthStore().user).toEqual(saved);
        expect(toastAdd).not.toHaveBeenCalled();
    });

    it("does nothing when the picked theme is already active", () => {
        const { select } = useSelectColorTheme();

        select("noir");

        expect(mutate).not.toHaveBeenCalled();
        expect(apiClient.updateMe).not.toHaveBeenCalled();
    });

    it("reverts to the previous theme and shows a toast when the save fails", async () => {
        apiClient.updateMe.mockRejectedValue({ response: { data: { message: "Server is down" } } });
        const { select } = useSelectColorTheme();

        select("ocean");
        expect(useThemeStore().colorTheme).toBe("ocean");
        await settle();

        expect(useThemeStore().colorTheme).toBe("noir");
        expect(toastAdd).toHaveBeenCalledWith({
            severity: "error",
            summary: "Couldn't save your theme",
            detail: "Server is down",
            life: 5000,
        });
    });

    it("falls back to a generic toast message when the error carries none", async () => {
        apiClient.updateMe.mockRejectedValue(new Error("Network Error"));
        const { select } = useSelectColorTheme();

        select("ocean");
        await settle();

        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: "Please try again." }));
    });

    it("applies the theme on this device only for the demo user, without calling updateMe", () => {
        useAuthStore().user = { ...baseUser, isDemo: true };
        const { select, isDeviceOnly } = useSelectColorTheme();

        select("ocean");

        expect(isDeviceOnly.value).toBe(true);
        expect(useThemeStore().colorTheme).toBe("ocean");
        expect(mutate).not.toHaveBeenCalled();
        expect(apiClient.updateMe).not.toHaveBeenCalled();
    });

    it("does not revert when an earlier save fails after a newer pick", async () => {
        const first = deferred<IAuthUser>();
        apiClient.updateMe.mockReturnValueOnce(first.promise);
        apiClient.updateMe.mockResolvedValueOnce({ ...baseUser, colorTheme: "noir" });
        const { select } = useSelectColorTheme();

        select("ocean");
        select("noir");
        expect(useThemeStore().colorTheme).toBe("noir");

        first.reject({ response: { data: { message: "Timed out" } } });
        await settle();

        expect(useThemeStore().colorTheme).toBe("noir");
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: "Timed out" }));
    });

    it("keeps the newer pick when an earlier pick's save resolves while the newer one is still pending", async () => {
        const first = deferred<IAuthUser>();
        const second = deferred<IAuthUser>();
        apiClient.updateMe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { select } = useSelectColorTheme();

        select("ocean");
        select("noir");

        first.resolve({ ...baseUser, colorTheme: "ocean" });
        await settle();

        // The earlier response must not switch the app back to Ocean, nor replace the cached user.
        expect(useThemeStore().colorTheme).toBe("noir");
        expect(useAuthStore().user).toEqual(baseUser);

        second.resolve({ ...baseUser, colorTheme: "noir" });
        await settle();

        expect(useThemeStore().colorTheme).toBe("noir");
        expect(useAuthStore().user).toEqual({ ...baseUser, colorTheme: "noir" });
        expect(toastAdd).not.toHaveBeenCalled();
    });

    it("ignores an earlier pick's response that lands after the newer one has saved", async () => {
        const first = deferred<IAuthUser>();
        const second = deferred<IAuthUser>();
        apiClient.updateMe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { select } = useSelectColorTheme();

        select("ocean");
        select("noir");

        second.resolve({ ...baseUser, colorTheme: "noir" });
        await settle();
        first.resolve({ ...baseUser, colorTheme: "ocean" });
        await settle();

        expect(useThemeStore().colorTheme).toBe("noir");
        expect(useAuthStore().user).toEqual({ ...baseUser, colorTheme: "noir" });
    });
});
