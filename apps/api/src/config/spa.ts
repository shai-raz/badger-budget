import { existsSync } from "fs";
import { basename, join, relative, resolve, sep } from "path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import serveStatic from "serve-static";

/**
 * Directory with the built SPA (`index.html` + assets) that this API serves on the same origin,
 * or null when `WEB_DIST_DIR` is unset or does not contain a built app.
 */
export function resolveWebDistDir(env: NodeJS.ProcessEnv = process.env): string | null {
    const dir = env.WEB_DIST_DIR?.trim();
    if (!dir) return null;
    return existsSync(join(dir, "index.html")) ? dir : null;
}

/** Paths owned by the API. The SPA never answers these, not even with a fallback page. */
export function isApiOrWellKnownPath(path: string): boolean {
    return path === "/api" || path.startsWith("/api/") || path.startsWith("/.well-known/");
}

/** Blocks framing on every response (clickjacking). The SPA must not be embeddable. */
export function frameHeadersMiddleware(): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
        res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        res.setHeader("X-Frame-Options", "DENY");
        next();
    };
}

/** Nuxt content-hashes everything under /_nuxt/, so those files can be cached forever. */
const IMMUTABLE_PREFIX = "_nuxt/";
/** Entry documents and service-worker files must always be revalidated. */
const NO_CACHE_FILE = /^(sw\.js|workbox-.*\.js|manifest\.webmanifest)$/;
/** Build output and any file-like path (has an extension in its last segment) is never a client route. */
const isAssetPath = (path: string): boolean => path.startsWith("/_nuxt/") || /\.[^/]+$/.test(path);

/**
 * Static file serving plus SPA fallback for `webDistDir`. Mount with `app.use(...)` before Nest's
 * router so built files win; /api and /.well-known are passed through to Nest.
 */
export function createSpaHandlers(webDistDir: string): RequestHandler[] {
    const staticFiles = serveStatic(webDistDir, {
        index: false,
        // Prerendered routes are directories (transactions/index.html): without this, serve-static answers
        // /transactions with a 301 to /transactions/ instead of letting the fallback serve index.html.
        redirect: false,
        setHeaders: (res: Response, filePath: string) => {
            const rel = relative(webDistDir, filePath).split(sep).join("/");
            if (rel.startsWith(IMMUTABLE_PREFIX)) {
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            } else if (rel.endsWith(".html") || NO_CACHE_FILE.test(basename(rel))) {
                res.setHeader("Cache-Control", "no-cache");
            }
        },
    });

    const indexHtml = resolve(webDistDir, "index.html");
    const staticOrSkip: RequestHandler = (req, res, next) =>
        isApiOrWellKnownPath(req.path) ? next() : staticFiles(req, res, next);

    const fallback: RequestHandler = (req, res, next) => {
        // Missing assets must 404 (not index.html), or stale tabs and the service worker cache HTML as JS/CSS.
        if ((req.method !== "GET" && req.method !== "HEAD") || isApiOrWellKnownPath(req.path) || isAssetPath(req.path))
            return next();
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(indexHtml, (err) => {
            if (err) next(err);
        });
    };

    return [staticOrSkip, fallback];
}
