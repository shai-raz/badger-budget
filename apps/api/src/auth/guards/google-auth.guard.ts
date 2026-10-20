import { ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { isGoogleAuthConfigured } from "../google-auth.config";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
    // The Google strategy is only registered when configured, so an unconfigured guard must not reach passport.
    override canActivate(context: ExecutionContext) {
        if (!isGoogleAuthConfigured()) {
            throw new NotFoundException("Google sign-in is not configured");
        }
        return super.canActivate(context);
    }
}
