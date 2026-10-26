import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
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

    it("re-reads the user with role on every request, so a role change applies without a new sign-in", async () => {
        const user = { id: "u1", email: "a@example.com", firstName: "A", lastName: "B", role: UserRole.ADMIN };
        findUnique.mockResolvedValue(user);

        await expect(strategy.validate({ sub: "u1", email: "a@example.com" })).resolves.toEqual(user);
        expect(findUnique).toHaveBeenCalledWith({
            where: { id: "u1" },
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });
    });

    it("rejects a token whose user no longer exists", async () => {
        findUnique.mockResolvedValue(null);

        await expect(strategy.validate({ sub: "gone", email: "x@example.com" })).rejects.toThrow(UnauthorizedException);
    });
});
