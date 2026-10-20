import { RequestMethod, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { buildCorsOptionsDelegate } from "./config/cors";
import { parseTrustProxyHops } from "./config/trust-proxy";
import { createSpaHandlers, frameHeadersMiddleware, resolveWebDistDir } from "./config/spa";

/** App wiring shared by main.ts and e2e tests. */
export function configureApp(app: NestExpressApplication): void {
    // Runs before Nest's router, on every response.
    app.use(frameHeadersMiddleware());

    // Global prefix; RFC 8414/9728 discovery documents must live at the host root.
    app.setGlobalPrefix("api/v1", {
        exclude: [{ path: ".well-known/{*path}", method: RequestMethod.GET }],
    });

    app.set("trust proxy", parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));

    app.enableCors(buildCorsOptionsDelegate());

    // Same-origin SPA: serve the built web app, ahead of Nest's router (which skips /api and /.well-known).
    const webDist = resolveWebDistDir();
    if (webDist) {
        app.use(...createSpaHandlers(webDist));
        console.log(`🖥️ Serving web app from ${webDist}`);
    }

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );
}
