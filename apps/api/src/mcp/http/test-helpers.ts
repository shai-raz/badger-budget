import type { ExecutionContext } from "@nestjs/common";

/** Minimal ExecutionContext exposing a fake request (and optional response) to guards and filters. */
export function httpContext(req: object, res: object = {}): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
}
