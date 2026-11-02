import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DEMO_EMAIL } from "../../demo/demo-data.constants";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
    const findUnique = jest.fn();
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    let strategy: JwtStrategy;

    beforeAll(() => {
        process.env.JWT_SECRET = "test-jwt-secret";
    });

    beforeEach(() => {
        findUnique.mockReset();
        strategy = new JwtStrategy(prisma);
    });

    it("re-reads the user with role and colour theme on every request, so a change applies without a new sign-in", async () => {
        const user = {
            id: "u1",
            email: "a@example.com",
            firstName: "A",
            lastName: "B",
            role: UserRole.ADMIN,
            colorTheme: null,
        };
        findUnique.mockResolvedValue(user);

        await expect(strategy.validate({ sub: "u1", email: "a@example.com" })).resolves.toEqual({
            id: "u1",
            email: "a@example.com",
            firstName: "A",
            lastName: "B",
            role: UserRole.ADMIN,
            colorTheme: null,
            isDemo: false,
        });
        expect(findUnique).toHaveBeenCalledWith({
            where: { id: "u1" },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, colorTheme: true },
        });
    });

    it("flags the demo account as isDemo", async () => {
        findUnique.mockResolvedValue({
            id: "d1",
            email: DEMO_EMAIL,
            firstName: "Demo",
            lastName: "User",
            role: UserRole.USER,
            colorTheme: null,
        });

        await expect(strategy.validate({ sub: "d1", email: DEMO_EMAIL })).resolves.toMatchObject({ isDemo: true });
    });

    it("reads a stored colour theme that the app still ships", async () => {
        findUnique.mockResolvedValue({
            id: "u2",
            email: "b@example.com",
            firstName: "B",
            lastName: "C",
            role: UserRole.USER,
            colorTheme: "ocean",
        });

        await expect(strategy.validate({ sub: "u2", email: "b@example.com" })).resolves.toMatchObject({
            colorTheme: "ocean",
        });
    });

    it("reads a stored colour theme the app no longer ships as the default", async () => {
        findUnique.mockResolvedValue({
            id: "u3",
            email: "c@example.com",
            firstName: "C",
            lastName: "D",
            role: UserRole.USER,
            colorTheme: "purple",
        });

        await expect(strategy.validate({ sub: "u3", email: "c@example.com" })).resolves.toMatchObject({
            colorTheme: null,
        });
    });

    it("rejects a token whose user no longer exists", async () => {
        findUnique.mockResolvedValue(null);

        await expect(strategy.validate({ sub: "gone", email: "x@example.com" })).rejects.toThrow(UnauthorizedException);
    });
});
