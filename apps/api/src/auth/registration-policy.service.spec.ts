import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException } from "@nestjs/common";
import { RegistrationPolicyService, REGISTRATION_LOCK_KEY } from "./registration-policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEMO_EMAIL } from "../demo/demo-data.constants";
import { Prisma, UserRole } from "@prisma/client";

describe("RegistrationPolicyService", () => {
    let service: RegistrationPolicyService;

    const mockPrismaService = {
        user: {
            count: jest.fn(),
        },
        $executeRaw: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RegistrationPolicyService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<RegistrationPolicyService>(RegistrationPolicyService);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe("isRegistrationOpen", () => {
        it("is open when no non-demo user exists", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            mockPrismaService.user.count.mockResolvedValue(0);

            await expect(service.isRegistrationOpen()).resolves.toBe(true);
        });

        it("is closed once a non-demo user exists", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            mockPrismaService.user.count.mockResolvedValue(1);

            await expect(service.isRegistrationOpen()).resolves.toBe(false);
        });

        it("counts users excluding the demo account and without a deletedAt filter, so soft-deleted users still close it", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            mockPrismaService.user.count.mockResolvedValue(0);

            await service.isRegistrationOpen();

            expect(mockPrismaService.user.count).toHaveBeenCalledWith({
                where: { email: { not: DEMO_EMAIL } },
            });
        });

        it("is open regardless of existing users when ALLOW_REGISTRATION=true", async () => {
            mockConfigService.get.mockImplementation((key: string) =>
                key === "ALLOW_REGISTRATION" ? "true" : undefined,
            );
            mockPrismaService.user.count.mockResolvedValue(5);

            await expect(service.isRegistrationOpen()).resolves.toBe(true);
            expect(mockPrismaService.user.count).not.toHaveBeenCalled();
        });

        it("treats any value other than the exact string 'true' as not forced", async () => {
            mockConfigService.get.mockReturnValue("");
            mockPrismaService.user.count.mockResolvedValue(1);

            await expect(service.isRegistrationOpen()).resolves.toBe(false);
        });

        it("reads through the given client when one is passed", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            const tx = { user: { count: jest.fn().mockResolvedValue(0) } };

            await expect(service.isRegistrationOpen(tx as unknown as Pick<PrismaService, "user">)).resolves.toBe(true);
            expect(tx.user.count).toHaveBeenCalled();
            expect(mockPrismaService.user.count).not.toHaveBeenCalled();
        });
    });

    describe("assertRegistrationOpen", () => {
        it("resolves when open", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            mockPrismaService.user.count.mockResolvedValue(0);

            await expect(service.assertRegistrationOpen()).resolves.toBeUndefined();
        });

        it("throws ForbiddenException with the administrator hint when closed", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            mockPrismaService.user.count.mockResolvedValue(1);

            await expect(service.assertRegistrationOpen()).rejects.toThrow(ForbiddenException);
            await expect(service.assertRegistrationOpen()).rejects.toThrow(/ALLOW_REGISTRATION=true/);
        });
    });

    describe("lockAndAssert", () => {
        it("takes the advisory lock before counting users through the transaction client", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            const tx = {
                $executeRaw: jest.fn().mockResolvedValue(0),
                user: { count: jest.fn().mockResolvedValue(0) },
            };

            await expect(service.lockAndAssert(tx as unknown as Prisma.TransactionClient)).resolves.toBeUndefined();

            expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
            const [strings, key] = tx.$executeRaw.mock.calls[0];
            expect(strings.join("?")).toContain("pg_advisory_xact_lock");
            expect(key).toBe(REGISTRATION_LOCK_KEY);
            expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.count.mock.invocationCallOrder[0]);
            expect(mockPrismaService.user.count).not.toHaveBeenCalled();
        });

        it("throws ForbiddenException when a user exists at lock time", async () => {
            mockConfigService.get.mockReturnValue(undefined);
            const tx = {
                $executeRaw: jest.fn().mockResolvedValue(0),
                user: { count: jest.fn().mockResolvedValue(1) },
            };

            await expect(service.lockAndAssert(tx as unknown as Prisma.TransactionClient)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it("does not count when ALLOW_REGISTRATION=true but still takes the lock", async () => {
            mockConfigService.get.mockImplementation((key: string) =>
                key === "ALLOW_REGISTRATION" ? "true" : undefined,
            );
            const tx = {
                $executeRaw: jest.fn().mockResolvedValue(0),
                user: { count: jest.fn() },
            };

            await service.lockAndAssert(tx as unknown as Prisma.TransactionClient);

            expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
            expect(tx.user.count).not.toHaveBeenCalled();
        });
    });

    describe("roleForNewUser", () => {
        const makeTx = (adminCount: number) => ({
            user: { count: jest.fn().mockResolvedValue(adminCount) },
        });

        it("returns USER for the demo account without querying", async () => {
            const tx = makeTx(0);

            await expect(service.roleForNewUser(tx as unknown as Prisma.TransactionClient, DEMO_EMAIL)).resolves.toBe(
                UserRole.USER,
            );
            expect(tx.user.count).not.toHaveBeenCalled();
        });

        it("returns ADMIN when no live non-demo admin exists", async () => {
            const tx = makeTx(0);

            await expect(
                service.roleForNewUser(tx as unknown as Prisma.TransactionClient, "first@example.com"),
            ).resolves.toBe(UserRole.ADMIN);
        });

        it("returns USER when a live non-demo admin already exists", async () => {
            const tx = makeTx(1);

            await expect(
                service.roleForNewUser(tx as unknown as Prisma.TransactionClient, "second@example.com"),
            ).resolves.toBe(UserRole.USER);
        });

        it("counts only live, non-demo admins through the given transaction client", async () => {
            const tx = makeTx(0);

            await service.roleForNewUser(tx as unknown as Prisma.TransactionClient, "first@example.com");

            expect(tx.user.count).toHaveBeenCalledWith({
                where: { role: UserRole.ADMIN, deletedAt: null, email: { not: DEMO_EMAIL } },
            });
            expect(mockPrismaService.user.count).not.toHaveBeenCalled();
        });
    });
});
