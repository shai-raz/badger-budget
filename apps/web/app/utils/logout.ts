export const LOGIN_PATH = "/auth/login";

export interface LogoutDeps {
    logout: () => Promise<void>;
    navigate: (path: string) => unknown;
    close?: () => void;
}

/**
 * Closes any open menu first, signs out, then navigates to login once the sign-out has finished.
 * `close` is ignored unless it is a function: `@click="logout"` hands over a MouseEvent, and calling
 * that would throw before the sign-out ran.
 */
export async function runLogout(deps: LogoutDeps): Promise<void> {
    if (typeof deps.close === "function") deps.close();
    await deps.logout();
    await deps.navigate(LOGIN_PATH);
}
