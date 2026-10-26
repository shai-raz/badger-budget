export const DEPLOY_WEBHOOK_TIMEOUT_MS = 15_000;

export interface DeployWebhookConfig {
    url: string;
    headers: Record<string, string>;
    body: string | undefined;
}

export interface DeployWebhookConfigResult {
    config: DeployWebhookConfig | null;
    warnings: string[];
}

/** RFC 7230 token characters: the only ones a header field name may use. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Trimmed value, or undefined when unset or whitespace-only (same rule as AppConfigController.isSet). */
function readVar(env: Record<string, string | undefined>, key: string): string | undefined {
    const value = env[key]?.trim();
    return value ? value : undefined;
}

/**
 * Parses the DEPLOY_WEBHOOK_* env vars. Never throws: an invalid setting disables the feature
 * and returns a warning that names only the variable, never its value.
 */
export function parseDeployWebhookConfig(env: Record<string, string | undefined>): DeployWebhookConfigResult {
    const warnings: string[] = [];
    const disabled = (warning: string): DeployWebhookConfigResult => {
        warnings.push(warning);
        return { config: null, warnings };
    };

    const url = readVar(env, "DEPLOY_WEBHOOK_URL");
    if (url === undefined) return { config: null, warnings };

    let parsedUrl: URL | undefined;
    try {
        parsedUrl = new URL(url);
    } catch {
        parsedUrl = undefined;
    }
    if (parsedUrl === undefined || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
        return disabled("DEPLOY_WEBHOOK_URL is not a valid http(s) URL; in-app upgrade is disabled");
    }
    // fetch refuses any URL that carries userinfo, so every upgrade click would fail as invalid-request.
    if (parsedUrl.username !== "" || parsedUrl.password !== "") {
        return disabled(
            "DEPLOY_WEBHOOK_URL must not contain credentials; use DEPLOY_WEBHOOK_TOKEN (and DEPLOY_WEBHOOK_TOKEN_HEADER) instead; in-app upgrade is disabled",
        );
    }

    const headers: Record<string, string> = {};

    const token = readVar(env, "DEPLOY_WEBHOOK_TOKEN");
    if (token !== undefined) {
        // A header value with CR, LF or NUL makes fetch reject the request on every click.
        if (/[\r\n\0]/.test(token)) {
            return disabled("DEPLOY_WEBHOOK_TOKEN must not contain line breaks or NUL; in-app upgrade is disabled");
        }
        const headerName = readVar(env, "DEPLOY_WEBHOOK_TOKEN_HEADER");
        if (headerName === undefined) {
            headers.authorization = `Bearer ${token}`;
        } else if (!HEADER_NAME_PATTERN.test(headerName)) {
            return disabled("DEPLOY_WEBHOOK_TOKEN_HEADER is not a valid header name; in-app upgrade is disabled");
        } else {
            const name = headerName.toLowerCase();
            if (name === "authorization") {
                headers.authorization = token.includes(" ") ? token : `Bearer ${token}`;
            } else {
                headers[name] = token;
            }
        }
    }

    const body = readVar(env, "DEPLOY_WEBHOOK_BODY");
    if (body !== undefined) {
        try {
            JSON.parse(body);
        } catch {
            return disabled("DEPLOY_WEBHOOK_BODY is not valid JSON; in-app upgrade is disabled");
        }
        headers["content-type"] = "application/json";
    }

    return { config: { url, headers, body }, warnings };
}
