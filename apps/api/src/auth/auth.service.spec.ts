import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import {
    Logger,
    NotFoundException,
    UnauthorizedException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccountsService } from "../accounts/accounts.service";
import { DemoService } from "../demo/demo.service";
import { DEMO_EMAIL } from "../demo/demo-data.constants";
import * as bcrypt from "bcrypt";
import { isGoogleAuthConfigured } from "./google-auth.config";
import { RegistrationPolicyService } from "./registration-policy.service";

jest.mock("bcrypt");
jest.mock("./google-auth.config", () => ({ isGoogleAuthConfigured: jest.fn() }));

describe("AuthService", () => {
    let service: AuthService;
    let prisma: PrismaService;
    let jwtService: JwtService;

    const mockPrismaService = {
        user: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        refreshToken: {
            findFirst: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
        },
        account: {
            create: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const mockJwtService = {
        sign: jest.fn(),
        verify: jest.fn(),
    };

    const mockAccountsService = {};

    const mockDemoService = { topUpIfStale: jest.fn().mockResolvedValue(null) };

    const mockRegistrationPolicy = {
        assertRegistrationOpen: jest.fn().mockResolvedValue(undefined),
        lockAndAssert: jest.fn().mockResolvedValue(undefined),
        roleForNewUser: jest.fn().mockResolvedValue(UserRole.USER),
    };

    const mockUser = {
        id: "user-id",
        email: "test@example.com",
        password: "hashed-password",
        firstName: "John",
        lastName: "Doe",
        googleId: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        role: UserRole.USER,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: JwtService,
                    useValue: mockJwtService,
                },
                {
                    provide: AccountsService,
                    useValue: mockAccountsService,
                },
                {
                    provide: DemoService,
                    useValue: mockDemoService,
                },
                {
                    provide: RegistrationPolicyService,
                    useValue: mockRegistrationPolicy,
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        prisma = module.get<PrismaService>(PrismaService);
        jwtService = module.get<JwtService>(JwtService);
        // clearAllMocks keeps implementations, so reset the ones a test may replace (e.g. the concurrent sign-up test).
        mockRegistrationPolicy.roleForNewUser.mockReset().mockResolvedValue(UserRole.USER);
        mockPrismaService.$transaction.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("register", () => {
        it("should register a new user successfully", async () => {
            const registerDto = {
                email: "test@example.com",
                password: "password123",
                firstName: "John",
                lastName: "Doe",
            };

            const createdUser = {
                ...mockUser,
                firstName: "John",
                lastName: "Doe",
            };

            mockPrismaService.user.findUnique
                .mockResolvedValueOnce(null) // First call - check if email exists
                .mockResolvedValueOnce(createdUser); // Second call - get user details in generateTokens
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");

            // Mock the transaction to execute the callback and return the user
            const accountCreate = jest.fn().mockResolvedValue({});
            const currencyFindUnique = jest.fn().mockResolvedValue({ id: "ils-id" });
            const tx = {
                user: {
                    create: jest.fn().mockResolvedValue(createdUser),
                },
                account: {
                    create: accountCreate,
                },
                currency: {
                    findUnique: currencyFindUnique,
                },
            };
            mockPrismaService.$transaction.mockImplementation(async (callback) => callback(tx));

            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.register(registerDto);

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                where: { email: registerDto.email },
            });
            expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
            expect(mockRegistrationPolicy.assertRegistrationOpen).toHaveBeenCalled();
            expect(mockPrismaService.$transaction).toHaveBeenCalled();
            expect(mockRegistrationPolicy.lockAndAssert).toHaveBeenCalledWith(tx);
            expect(currencyFindUnique).toHaveBeenCalledWith({ where: { code: "ILS" }, select: { id: true } });
            expect(accountCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ type: "cash", name: "Cash", currencyId: "ils-id" }),
            });
            expect(result).toHaveProperty("accessToken");
            expect(result).toHaveProperty("refreshToken");
            expect(result).toHaveProperty("user");
        });

        it("should throw ConflictException if email already exists", async () => {
            const registerDto = {
                email: "test@example.com",
                password: "password123",
                firstName: "John",
                lastName: "Doe",
            };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

            await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
            expect(mockPrismaService.user.create).not.toHaveBeenCalled();
        });

        it("decides the role inside the locked transaction, after the lock and before the insert", async () => {
            const registerDto = {
                email: "first@example.com",
                password: "password123",
                firstName: "First",
                lastName: "User",
            };
            const createdUser = { ...mockUser, id: "first-id", email: "first@example.com" };
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
            mockRegistrationPolicy.roleForNewUser.mockResolvedValueOnce(UserRole.ADMIN);
            const userCreate = jest.fn().mockResolvedValue(createdUser);
            const tx = {
                user: { create: userCreate },
                account: { create: jest.fn().mockResolvedValue({}) },
                currency: { findUnique: jest.fn().mockResolvedValue({ id: "ils-id" }) },
            };
            mockPrismaService.$transaction.mockImplementation(async (callback) => callback(tx));
            mockJwtService.sign.mockReturnValue("token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            await service.register(registerDto);

            expect(mockRegistrationPolicy.roleForNewUser).toHaveBeenCalledWith(tx, "first@example.com");
            expect(userCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ email: "first@example.com", role: UserRole.ADMIN }),
            });
            const lockOrder = mockRegistrationPolicy.lockAndAssert.mock.invocationCallOrder[0];
            const roleOrder = mockRegistrationPolicy.roleForNewUser.mock.invocationCallOrder[0];
            const createOrder = userCreate.mock.invocationCallOrder[0];
            expect(lockOrder).toBeLessThan(roleOrder);
            expect(roleOrder).toBeLessThan(createOrder);
        });

        it("gives ADMIN only to the first of two concurrent sign-ups, because the role is decided under the lock", async () => {
            // Model the advisory lock: transactions run one after another over one shared users table.
            const users: { email: string; role: UserRole }[] = [];
            let queue: Promise<unknown> = Promise.resolve();
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
            mockJwtService.sign.mockReturnValue("token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});
            mockRegistrationPolicy.roleForNewUser.mockImplementation(async () =>
                users.some((user) => user.role === UserRole.ADMIN) ? UserRole.USER : UserRole.ADMIN,
            );
            const tx = {
                user: {
                    create: jest.fn(async ({ data }: { data: { email: string; role: UserRole } }) => {
                        users.push({ email: data.email, role: data.role });
                        return { ...mockUser, id: data.email, email: data.email };
                    }),
                },
                account: { create: jest.fn().mockResolvedValue({}) },
                currency: { findUnique: jest.fn().mockResolvedValue({ id: "ils-id" }) },
            };
            mockPrismaService.$transaction.mockImplementation((callback) => {
                const run = queue.then(() => callback(tx));
                queue = run.catch(() => undefined);
                return run;
            });

            await Promise.all([
                service.register({
                    email: "first@example.com",
                    password: "password123",
                    firstName: "A",
                    lastName: "B",
                }),
                service.register({
                    email: "second@example.com",
                    password: "password123",
                    firstName: "C",
                    lastName: "D",
                }),
            ]);

            expect(users).toEqual([
                { email: "first@example.com", role: UserRole.ADMIN },
                { email: "second@example.com", role: UserRole.USER },
            ]);
        });

        it("should throw ForbiddenException before any lookup or hashing when registration is closed", async () => {
            const registerDto = {
                email: "test@example.com",
                password: "password123",
                firstName: "John",
                lastName: "Doe",
            };
            mockRegistrationPolicy.assertRegistrationOpen.mockRejectedValueOnce(new ForbiddenException("closed"));

            await expect(service.register(registerDto)).rejects.toThrow(ForbiddenException);
            expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
            expect(bcrypt.hash).not.toHaveBeenCalled();
            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });

        it("should not create the user when registration closes before the transaction locks", async () => {
            const registerDto = {
                email: "test@example.com",
                password: "password123",
                firstName: "John",
                lastName: "Doe",
            };
            const userCreate = jest.fn();
            mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
            mockPrismaService.$transaction.mockImplementation(async (callback) =>
                callback({ user: { create: userCreate } }),
            );
            mockRegistrationPolicy.lockAndAssert.mockRejectedValueOnce(new ForbiddenException("closed"));

            await expect(service.register(registerDto)).rejects.toThrow(ForbiddenException);
            expect(userCreate).not.toHaveBeenCalled();
        });
    });

    describe("login", () => {
        it("should login successfully with valid credentials", async () => {
            const loginDto = {
                email: "test@example.com",
                password: "password123",
            };

            mockPrismaService.user.findUnique
                .mockResolvedValueOnce(mockUser) // First call - check credentials
                .mockResolvedValueOnce(mockUser); // Second call - get user details in generateTokens
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.login(loginDto);

            expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
                where: { email: loginDto.email },
            });
            expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.password);
            expect(result).toHaveProperty("accessToken");
            expect(result).toHaveProperty("refreshToken");
            expect(result).toHaveProperty("user");
            expect(result.user).toEqual({
                id: mockUser.id,
                email: mockUser.email,
                firstName: mockUser.firstName,
                lastName: mockUser.lastName,
                role: UserRole.USER,
            });
        });

        it("returns the stored role of an admin on login", async () => {
            const adminUser = { ...mockUser, role: UserRole.ADMIN };
            mockPrismaService.user.findUnique.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(adminUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.login({ email: mockUser.email, password: "password123" });

            expect(result.user.role).toBe(UserRole.ADMIN);
        });

        it("should throw UnauthorizedException if user not found", async () => {
            const loginDto = {
                email: "test@example.com",
                password: "password123",
            };

            mockPrismaService.user.findUnique.mockResolvedValue(null);

            await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        });

        it("should throw UnauthorizedException if password is invalid", async () => {
            const loginDto = {
                email: "test@example.com",
                password: "wrong-password",
            };

            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        });

        it("should throw UnauthorizedException if user has no password (OAuth only)", async () => {
            const loginDto = {
                email: "test@example.com",
                password: "password123",
            };

            mockPrismaService.user.findUnique.mockResolvedValue({
                ...mockUser,
                password: null,
            });

            await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
        });

        it("should top up demo data when the demo user logs in", async () => {
            const demoUser = { ...mockUser, email: DEMO_EMAIL };
            const loginDto = {
                email: DEMO_EMAIL,
                password: "password123",
            };

            mockPrismaService.user.findUnique
                .mockResolvedValueOnce(demoUser) // First call - check credentials
                .mockResolvedValueOnce(demoUser); // Second call - get user details in generateTokens
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.login(loginDto);

            expect(mockDemoService.topUpIfStale).toHaveBeenCalledTimes(1);
            expect(mockDemoService.topUpIfStale).toHaveBeenCalledWith(demoUser.id);
            expect(result).toHaveProperty("accessToken");
            expect(result).toHaveProperty("refreshToken");
        });

        it("should not top up demo data for a non-demo user", async () => {
            const loginDto = {
                email: "test@example.com",
                password: "password123",
            };

            mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            await service.login(loginDto);

            expect(mockDemoService.topUpIfStale).not.toHaveBeenCalled();
        });

        it("should still resolve with tokens when demo top-up fails", async () => {
            const demoUser = { ...mockUser, email: DEMO_EMAIL };
            const loginDto = {
                email: DEMO_EMAIL,
                password: "password123",
            };

            const loggerSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
            mockDemoService.topUpIfStale.mockRejectedValueOnce(new Error("boom"));
            mockPrismaService.user.findUnique.mockResolvedValueOnce(demoUser).mockResolvedValueOnce(demoUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.login(loginDto);

            expect(result).toHaveProperty("accessToken");
            expect(result).toHaveProperty("refreshToken");
            expect(loggerSpy).toHaveBeenCalled();

            loggerSpy.mockRestore();
        });

        it("should throw UnauthorizedException for invalid demo password without topping up", async () => {
            const demoUser = { ...mockUser, email: DEMO_EMAIL };
            const loginDto = {
                email: DEMO_EMAIL,
                password: "wrong-password",
            };

            mockPrismaService.user.findUnique.mockResolvedValue(demoUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
            expect(mockDemoService.topUpIfStale).not.toHaveBeenCalled();
        });
    });

    describe("refreshTokens", () => {
        it("should refresh tokens successfully", async () => {
            const refreshToken = "valid-refresh-token";
            const payload = { sub: "user-id", email: "test@example.com" };

            mockJwtService.verify.mockReturnValue(payload);
            mockPrismaService.refreshToken.findFirst.mockResolvedValue({
                id: "token-id",
                token: refreshToken,
                userId: "user-id",
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            mockPrismaService.refreshToken.delete.mockResolvedValue({});
            mockJwtService.sign.mockReturnValueOnce("new-access-token").mockReturnValueOnce("new-refresh-token");
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.refreshTokens(refreshToken);

            expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            });
            expect(mockPrismaService.refreshToken.delete).toHaveBeenCalled();
            expect(result).toHaveProperty("accessToken");
            expect(result).toHaveProperty("refreshToken");
        });

        it("should throw UnauthorizedException if refresh token is invalid", async () => {
            const refreshToken = "invalid-token";

            mockJwtService.verify.mockImplementation(() => {
                throw new Error("Invalid token");
            });

            await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
        });

        it("should throw UnauthorizedException if refresh token not found in DB", async () => {
            const refreshToken = "valid-refresh-token";
            const payload = { sub: "user-id", email: "test@example.com" };

            mockJwtService.verify.mockReturnValue(payload);
            mockPrismaService.refreshToken.findFirst.mockResolvedValue(null);

            await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe("logout", () => {
        it("should logout successfully", async () => {
            const userId = "user-id";
            const refreshToken = "refresh-token";

            mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

            await service.logout(userId, refreshToken);

            expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
                where: {
                    userId,
                    token: refreshToken,
                },
            });
        });
    });

    describe("validateUser", () => {
        it("should return user without password if credentials are valid", async () => {
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const result = await service.validateUser("test@example.com", "password123");

            expect(result).toBeDefined();
            expect(result).not.toHaveProperty("password");
            expect(result.email).toBe("test@example.com");
        });

        it("should return null if user not found", async () => {
            mockPrismaService.user.findUnique.mockResolvedValue(null);

            const result = await service.validateUser("test@example.com", "password123");

            expect(result).toBeNull();
        });

        it("should return null if password is invalid", async () => {
            mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            const result = await service.validateUser("test@example.com", "wrong-password");

            expect(result).toBeNull();
        });
    });

    describe("validateGoogleUser", () => {
        it("should create new user from Google profile", async () => {
            const googleProfile = {
                id: "google-id",
                emails: [{ value: "google@example.com" }],
                name: { givenName: "Google", familyName: "User" },
            };

            mockPrismaService.user.findUnique.mockResolvedValue(null);
            const userCreate = jest.fn().mockResolvedValue({
                ...mockUser,
                email: "google@example.com",
                googleId: "google-id",
            });
            const tx = {
                user: { create: userCreate },
                account: { create: jest.fn().mockResolvedValue({}) },
                currency: { findUnique: jest.fn().mockResolvedValue({ id: "ils-id" }) },
            };
            mockPrismaService.$transaction.mockImplementation(async (callback) => callback(tx));
            mockRegistrationPolicy.roleForNewUser.mockResolvedValueOnce(UserRole.ADMIN);

            const result = await service.validateGoogleUser(googleProfile);

            expect(mockPrismaService.user.create).not.toHaveBeenCalled();
            expect(mockRegistrationPolicy.lockAndAssert).toHaveBeenCalledWith(tx);
            expect(mockRegistrationPolicy.roleForNewUser).toHaveBeenCalledWith(tx, "google@example.com");
            expect(userCreate).toHaveBeenCalledWith({
                data: {
                    email: "google@example.com",
                    firstName: "Google",
                    lastName: "User",
                    googleId: "google-id",
                    role: UserRole.ADMIN,
                    currencyBackfilledAt: expect.any(Date),
                },
            });
            expect(tx.account.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ userId: "user-id", type: "cash", currencyId: "ils-id" }),
            });
            expect(mockRegistrationPolicy.lockAndAssert.mock.invocationCallOrder[0]).toBeLessThan(
                mockRegistrationPolicy.roleForNewUser.mock.invocationCallOrder[0],
            );
            expect(mockRegistrationPolicy.roleForNewUser.mock.invocationCallOrder[0]).toBeLessThan(
                userCreate.mock.invocationCallOrder[0],
            );
            expect(result.googleId).toBe("google-id");
        });

        it("should not create a Google user when the lock-time check closes registration", async () => {
            const googleProfile = {
                id: "google-id",
                emails: [{ value: "google@example.com" }],
                name: { givenName: "Google", familyName: "User" },
            };
            mockPrismaService.user.findUnique.mockResolvedValue(null);
            const userCreate = jest.fn();
            mockPrismaService.$transaction.mockImplementation(async (callback) =>
                callback({ user: { create: userCreate } }),
            );
            mockRegistrationPolicy.lockAndAssert.mockRejectedValueOnce(new ForbiddenException("closed"));

            await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(ForbiddenException);
            expect(userCreate).not.toHaveBeenCalled();
        });

        it("should refuse to create a new Google user when registration is closed", async () => {
            const googleProfile = {
                id: "google-id",
                emails: [{ value: "google@example.com" }],
                name: { givenName: "Google", familyName: "User" },
            };

            mockPrismaService.user.findUnique.mockResolvedValue(null);
            mockRegistrationPolicy.assertRegistrationOpen.mockRejectedValueOnce(new ForbiddenException("closed"));

            await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(ForbiddenException);
            expect(mockPrismaService.user.create).not.toHaveBeenCalled();
        });

        it("should link Google account to existing user", async () => {
            const googleProfile = {
                id: "google-id",
                emails: [{ value: "test@example.com" }],
                name: { givenName: "John", familyName: "Doe" },
            };

            const existingUser = { ...mockUser, googleId: null };
            mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
            mockPrismaService.user.update.mockResolvedValue({
                ...existingUser,
                googleId: "google-id",
            });

            const result = await service.validateGoogleUser(googleProfile);

            expect(mockPrismaService.user.update).toHaveBeenCalledWith({
                where: { id: existingUser.id },
                data: { googleId: "google-id" },
            });
            expect(result.googleId).toBe("google-id");
        });

        it("should return existing user if already linked to Google", async () => {
            const googleProfile = {
                id: "google-id",
                emails: [{ value: "test@example.com" }],
                name: { givenName: "John", familyName: "Doe" },
            };

            const existingUser = { ...mockUser, googleId: "google-id" };
            mockPrismaService.user.findUnique.mockResolvedValue(existingUser);

            const result = await service.validateGoogleUser(googleProfile);

            expect(mockPrismaService.user.update).not.toHaveBeenCalled();
            expect(result.googleId).toBe("google-id");
        });
    });

    describe("exchangeGoogleCode", () => {
        it("throws NotFoundException when Google sign-in is not configured", async () => {
            (isGoogleAuthConfigured as jest.Mock).mockReturnValue(false);

            await expect(service.exchangeGoogleCode("code", "redirect", "verifier")).rejects.toThrow(NotFoundException);
        });

        describe("new user registration gate", () => {
            const googleIdPayload = {
                email: "new@example.com",
                sub: "google-sub",
                given_name: "New",
                family_name: "User",
                picture: "https://example.com/pic.png",
            };

            beforeEach(() => {
                (isGoogleAuthConfigured as jest.Mock).mockReturnValue(true);
                jest.spyOn(service["googleClient"], "getToken").mockResolvedValue({
                    tokens: { id_token: "id-token" },
                } as never);
                jest.spyOn(service["googleClient"], "verifyIdToken").mockResolvedValue({
                    getPayload: () => googleIdPayload,
                } as never);
                mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
            });

            it("creates the user inside a transaction that asserts registration is open", async () => {
                const createdUser = {
                    ...mockUser,
                    id: "new-user-id",
                    email: "new@example.com",
                    googleId: "google-sub",
                };
                mockPrismaService.user.findUnique.mockResolvedValueOnce(createdUser); // generateTokens lookup
                const userCreate = jest.fn().mockResolvedValue(createdUser);
                const accountCreate = jest.fn().mockResolvedValue({});
                const tx = {
                    user: { create: userCreate },
                    account: { create: accountCreate },
                    currency: { findUnique: jest.fn().mockResolvedValue({ id: "ils-id" }) },
                };
                mockPrismaService.$transaction.mockImplementation(async (callback) => callback(tx));
                mockJwtService.sign.mockReturnValueOnce("access-token").mockReturnValueOnce("refresh-token");
                mockPrismaService.refreshToken.create.mockResolvedValue({});

                mockRegistrationPolicy.roleForNewUser.mockResolvedValueOnce(UserRole.ADMIN);

                const result = await service.exchangeGoogleCode("code", "redirect", "verifier");

                expect(mockRegistrationPolicy.lockAndAssert).toHaveBeenCalledWith(tx);
                expect(mockRegistrationPolicy.roleForNewUser).toHaveBeenCalledWith(tx, "new@example.com");
                expect(userCreate).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        email: "new@example.com",
                        googleId: "google-sub",
                        role: UserRole.ADMIN,
                    }),
                });
                expect(mockRegistrationPolicy.lockAndAssert.mock.invocationCallOrder[0]).toBeLessThan(
                    mockRegistrationPolicy.roleForNewUser.mock.invocationCallOrder[0],
                );
                expect(mockRegistrationPolicy.roleForNewUser.mock.invocationCallOrder[0]).toBeLessThan(
                    userCreate.mock.invocationCallOrder[0],
                );
                expect(accountCreate).toHaveBeenCalledWith({
                    data: expect.objectContaining({ type: "cash", currencyId: "ils-id" }),
                });
                expect(result).toHaveProperty("accessToken", "access-token");
            });

            it("rejects with ForbiddenException (not 401) and creates no user when registration is closed", async () => {
                const userCreate = jest.fn();
                mockPrismaService.$transaction.mockImplementation(async (callback) =>
                    callback({ user: { create: userCreate } }),
                );
                mockRegistrationPolicy.lockAndAssert.mockRejectedValueOnce(new ForbiddenException("closed"));

                const error = await service.exchangeGoogleCode("code", "redirect", "verifier").catch((e: unknown) => e);

                expect(error).toBeInstanceOf(ForbiddenException);
                expect(error).not.toBeInstanceOf(UnauthorizedException);
                expect(userCreate).not.toHaveBeenCalled();
            });
        });
    });
});
