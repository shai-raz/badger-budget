import { resolveWebDistDir } from "./spa";

export interface PublicUrls {
    apiPublicUrl: string;
    webAppUrl: string;
}

/** Trims and drops trailing slashes; blank values count as unset. */
function clean(value: string | undefined): string | undefined {
    const trimmed = value?.trim().replace(/\/+$/, "");
    return trimmed || undefined;
}

/**
 * Public URLs of the API and the web app, from environment only (never from request Host headers).
 * `PUBLIC_URL` is the one-origin shortcut: the API, the web app and CORS all use it unless a
 * specific variable overrides it.
 */
export function resolvePublicUrls(
    env: NodeJS.ProcessEnv = process.env,
    spaServed: boolean = resolveWebDistDir(env) !== null,
): PublicUrls {
    const publicUrl = clean(env.PUBLIC_URL);
    const apiPublicUrl = clean(env.API_PUBLIC_URL) ?? publicUrl ?? `http://localhost:${env.PORT || 3000}`;
    const webAppUrl = clean(env.WEB_APP_URL) ?? publicUrl ?? (spaServed ? apiPublicUrl : "http://localhost:3001");
    return { apiPublicUrl, webAppUrl };
}
