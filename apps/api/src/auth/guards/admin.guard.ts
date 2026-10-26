import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";

/**
 * Lets through only the instance admin. Must run after JwtAuthGuard, which sets `request.user`.
 * The role is read from the database on every request: JwtStrategy.validate re-reads the user, so a
 * role change applies without signing in again.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const user = ctx.switchToHttp().getRequest<{ user?: { role?: UserRole } }>().user;
        if (user?.role !== UserRole.ADMIN) {
            throw new ForbiddenException("Only the instance admin can do this");
        }
        return true;
    }
}
