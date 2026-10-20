import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

/** Origins allowed for credentialed app requests. Also reused by the MCP Origin guard. */
export function getAllowedOrigins(): (string | RegExp)[] {
    const allowedOrigins: (string | RegExp)[] = [
        "http://localhost:3000", // Nuxt dev server
        "http://localhost:3001", // Alternative Nuxt port
    ];
    const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
    if (publicUrl) allowedOrigins.push(publicUrl);
    if (process.env.CORS_ORIGIN) allowedOrigins.push(process.env.CORS_ORIGIN);
    return allowedOrigins;
}

/** Paths used by OAuth/MCP clients that are not browsers on our origins: open CORS, never credentialed. */
const PUBLIC_PATH_PATTERNS = [/^\/\.well-known\//, /^\/api\/v1\/oauth\/(register|token|revoke)$/, /^\/api\/v1\/mcp$/];

type CorsRequest = { originalUrl?: string; url?: string };

export function buildCorsOptionsDelegate() {
    const appOptions: CorsOptions = {
        origin: getAllowedOrigins(),
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    };
    const publicOptions: CorsOptions = {
        origin: true,
        credentials: false,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Accept",
            "Mcp-Protocol-Version",
            "Mcp-Session-Id",
            "Last-Event-ID",
        ],
        exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
    };

    return (req: CorsRequest, callback: (err: Error | null, options?: CorsOptions) => void) => {
        const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
        callback(null, PUBLIC_PATH_PATTERNS.some((re) => re.test(path)) ? publicOptions : appOptions);
    };
}
