import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { OAuthError } from "./oauth-error";

/** Renders an OAuthError as the RFC 6749 section 5.2 JSON error response. */
@Catch(OAuthError)
export class OAuthExceptionFilter implements ExceptionFilter<OAuthError> {
    catch(exception: OAuthError, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        res.status(exception.status)
            .set({ "Cache-Control": "no-store", Pragma: "no-cache" })
            .json({ error: exception.error, error_description: exception.description });
    }
}
