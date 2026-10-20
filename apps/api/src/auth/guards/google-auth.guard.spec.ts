import { ExecutionContext, NotFoundException } from "@nestjs/common";
import { GoogleAuthGuard } from "./google-auth.guard";
import { isGoogleAuthConfigured } from "../google-auth.config";

jest.mock("../google-auth.config", () => ({ isGoogleAuthConfigured: jest.fn() }));

describe("GoogleAuthGuard", () => {
    const context = {} as ExecutionContext;
    const configured = isGoogleAuthConfigured as jest.Mock;

    // canActivate lives on the AuthGuard("google") mixin, the guard's direct superclass.
    const parentCanActivate = () => Object.getPrototypeOf(GoogleAuthGuard.prototype);

    afterEach(() => {
        jest.restoreAllMocks();
        configured.mockReset();
    });

    it("throws NotFoundException without calling passport when Google is not configured", () => {
        configured.mockReturnValue(false);
        const parent = jest.spyOn(parentCanActivate(), "canActivate");

        expect(() => new GoogleAuthGuard().canActivate(context)).toThrow(NotFoundException);
        expect(() => new GoogleAuthGuard().canActivate(context)).toThrow("Google sign-in is not configured");
        expect(parent).not.toHaveBeenCalled();
    });

    it("delegates to passport when Google is configured", () => {
        configured.mockReturnValue(true);
        const parent = jest.spyOn(parentCanActivate(), "canActivate").mockReturnValue(true);

        expect(new GoogleAuthGuard().canActivate(context)).toBe(true);
        expect(parent).toHaveBeenCalledWith(context);
    });
});
