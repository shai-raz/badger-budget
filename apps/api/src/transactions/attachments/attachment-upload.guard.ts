import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    ServiceUnavailableException,
} from "@nestjs/common";
import { DEMO_EMAIL } from "@badger/shared-data";
import { AttachmentStorageService } from "./attachment-storage.service";

/**
 * Rejects an upload before it starts. Guards run before FileInterceptor, so these responses never buffer the body.
 * Runs after JwtAuthGuard, so req.user is set.
 */
@Injectable()
export class AttachmentUploadGuard implements CanActivate {
    constructor(private readonly storage: AttachmentStorageService) {}

    canActivate(context: ExecutionContext): boolean {
        if (!this.storage.enabled) {
            throw new ServiceUnavailableException("File storage isn't configured on this server");
        }
        const req = context.switchToHttp().getRequest<{ user?: { email?: string } }>();
        if (req.user?.email === DEMO_EMAIL) {
            throw new ForbiddenException("Uploads are disabled on the demo account");
        }
        return true;
    }
}
