import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
    const guard = new AdminGuard();

    const contextWithUser = (user: { role?: UserRole } | undefined) =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ user }) }),
        }) as unknown as ExecutionContext;

    it("lets the ADMIN through", () => {
        expect(guard.canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(true);
    });

    it("rejects a USER with 403", () => {
        expect(() => guard.canActivate(contextWithUser({ role: UserRole.USER }))).toThrow(ForbiddenException);
    });

    it("rejects a user with no role", () => {
        expect(() => guard.canActivate(contextWithUser({}))).toThrow(ForbiddenException);
    });

    it("rejects a request with no user", () => {
        expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
    });
});
