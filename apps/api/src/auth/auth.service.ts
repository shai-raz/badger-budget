import {
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { AccountsService } from "../accounts/accounts.service";
import { DemoService } from "../demo/demo.service";
import { DEMO_EMAIL } from "../demo/demo-data.constants";
import * as bcrypt from "bcrypt";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import { AuthResponse } from "./interfaces/auth-response.interface";
import { isGoogleAuthConfigured } from "./google-auth.config";
import { RegistrationPolicyService } from "./registration-policy.service";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { DEFAULT_CURRENCY_CODE } from "@badger/shared-data";
import type { Prisma } from "@prisma/client";

@Injectable()
export class AuthService {
    private googleClient: OAuth2Client;
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private accountsService: AccountsService,
        private demoService: DemoService,
        private registrationPolicy: RegistrationPolicyService,
    ) {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    }

    /** Every cash account must have a currency, so the signup "Cash" account gets the default one (ILS). */
    private async createDefaultCashAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
        const currency = await tx.currency.findUnique({
            where: { code: DEFAULT_CURRENCY_CODE },
            select: { id: true },
        });
        if (!currency) {
            throw new Error(`Default currency ${DEFAULT_CURRENCY_CODE} is missing; run the seeds`);
        }
        await tx.account.create({
            data: {
                userId,
                name: "Cash",
                type: "cash",
                icon: "wallet",
                color: "#64748B",
                currencyId: currency.id,
            },
        });
    }

    async register(registerDto: RegisterDto): Promise<AuthResponse> {
        // Before the email lookup, so a closed instance doesn't reveal which emails exist
        await this.registrationPolicy.assertRegistrationOpen();

        // Check if user already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: registerDto.email },
        });

        if (existingUser) {
            throw new ConflictException("Email already registered");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);

        // Create user and default cash account in a transaction
        const user = await this.prisma.$transaction(async (tx) => {
            await this.registrationPolicy.lockAndAssert(tx);

            const newUser = await tx.user.create({
                data: {
                    email: registerDto.email,
                    password: hashedPassword,
                    firstName: registerDto.firstName,
                    lastName: registerDto.lastName,
                    // New users have no legacy data, so mark as already backfilled
                    currencyBackfilledAt: new Date(),
                },
            });

            // Create default cash account
            await this.createDefaultCashAccount(tx, newUser.id);

            return newUser;
        });

        // Generate tokens
        return this.generateTokens(user.id, user.email);
    }

    async login(loginDto: LoginDto): Promise<AuthResponse> {
        // Find user
        const user = await this.prisma.user.findUnique({
            where: { email: loginDto.email },
        });

        if (!user || !user.password) {
            throw new UnauthorizedException("Invalid credentials");
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException("Invalid credentials");
        }

        if (user.email === DEMO_EMAIL) {
            await this.refreshDemoData(user.id);
        }

        // Generate tokens
        return this.generateTokens(user.id, user.email);
    }

    private async refreshDemoData(userId: string): Promise<void> {
        try {
            await this.demoService.topUpIfStale(userId);
        } catch (error) {
            this.logger.error(
                "Demo data top-up failed; continuing login",
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    async refreshTokens(refreshToken: string): Promise<AuthResponse> {
        try {
            // Verify refresh token
            const payload = this.jwtService.verify(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            });

            // Check if refresh token exists in DB
            const storedToken = await this.prisma.refreshToken.findFirst({
                where: {
                    token: refreshToken,
                    userId: payload.sub,
                    expiresAt: { gt: new Date() },
                },
            });

            if (!storedToken) {
                throw new UnauthorizedException("Invalid refresh token");
            }

            // Get user
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user) {
                throw new UnauthorizedException("User not found");
            }

            // Delete old refresh token
            await this.prisma.refreshToken.delete({
                where: { id: storedToken.id },
            });

            // Generate new tokens
            return this.generateTokens(user.id, user.email);
        } catch (error) {
            throw new UnauthorizedException("Invalid refresh token");
        }
    }

    async logout(userId: string, refreshToken: string): Promise<void> {
        // Delete refresh token from DB
        await this.prisma.refreshToken.deleteMany({
            where: {
                userId,
                token: refreshToken,
            },
        });
    }

    async validateUser(email: string, password: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (user && user.password) {
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (isPasswordValid) {
                const { password: _, ...result } = user;
                return result;
            }
        }
        return null;
    }

    async validateGoogleUser(profile: any): Promise<any> {
        // Find or create user from Google profile
        let user = await this.prisma.user.findUnique({
            where: { email: profile.emails[0].value },
        });

        if (!user) {
            await this.registrationPolicy.assertRegistrationOpen();
            // Create new user from Google profile
            user = await this.prisma.user.create({
                data: {
                    email: profile.emails[0].value,
                    firstName: profile.name.givenName || "",
                    lastName: profile.name.familyName || "",
                    googleId: profile.id,
                    // New users have no legacy data, so mark as already backfilled
                    currencyBackfilledAt: new Date(),
                },
            });
        } else if (!user.googleId) {
            // Link Google account to existing user
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: { googleId: profile.id },
            });
        }

        return user;
    }

    async exchangeGoogleCode(code: string, redirectUri: string, codeVerifier: string): Promise<AuthResponse> {
        if (!isGoogleAuthConfigured()) {
            throw new NotFoundException("Google sign-in is not configured");
        }
        try {
            console.log("[BACKEND] Exchanging authorization code for tokens...");
            console.log("[BACKEND] Code length:", code?.length);
            console.log("[BACKEND] Redirect URI:", redirectUri);
            console.log("[BACKEND] Code verifier length:", codeVerifier?.length);
            console.log("[BACKEND] Client ID:", process.env.GOOGLE_CLIENT_ID);

            // Exchange authorization code for tokens using PKCE
            const tokenResponse = await this.googleClient.getToken({
                code,
                redirect_uri: redirectUri,
                codeVerifier: codeVerifier,
            });

            console.log("[BACKEND] Token exchange successful, got ID token");

            if (!tokenResponse.tokens.id_token) {
                throw new UnauthorizedException("No ID token received from Google");
            }

            // Verify and extract user info from ID token
            const ticket = await this.googleClient.verifyIdToken({
                idToken: tokenResponse.tokens.id_token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            if (!payload || !payload.email) {
                throw new UnauthorizedException("Invalid Google token payload");
            }

            console.log("[BACKEND] User info extracted:", payload.email);

            // Find or create user
            let user = await this.prisma.user.findUnique({
                where: { email: payload.email },
            });

            if (!user) {
                console.log("[BACKEND] Creating new user from Google profile");
                user = await this.prisma.$transaction(async (tx) => {
                    await this.registrationPolicy.lockAndAssert(tx);

                    const newUser = await tx.user.create({
                        data: {
                            email: payload.email,
                            firstName: payload.given_name || payload.name || payload.email,
                            lastName: payload.family_name || "",
                            googleId: payload.sub,
                            avatarUrl: payload.picture,
                            // New users have no legacy data, so mark as already backfilled
                            currencyBackfilledAt: new Date(),
                        },
                    });

                    // Create default cash account
                    await this.createDefaultCashAccount(tx, newUser.id);

                    return newUser;
                });
            } else if (!user.googleId) {
                console.log("[BACKEND] Linking Google account to existing user");
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId: payload.sub,
                        avatarUrl: payload.picture || user.avatarUrl,
                    },
                });
            }

            console.log("[BACKEND] Generating JWT tokens");
            return this.generateTokens(user.id, user.email);
        } catch (error) {
            if (error instanceof ForbiddenException) {
                throw error;
            }
            console.error("[BACKEND] Google code exchange error:", error.message);
            console.error("[BACKEND] Full error:", error);
            throw new UnauthorizedException("Failed to authenticate with Google");
        }
    }

    async generateTokens(userId: string, email: string): Promise<AuthResponse> {
        const payload: JwtPayload = {
            sub: userId,
            email,
        };

        // Generate access token (15 minutes)
        const accessToken = this.jwtService.sign(payload, {
            secret: process.env.JWT_SECRET,
            expiresIn: "15m",
        });

        // Generate refresh token (7 days)
        const refreshToken = this.jwtService.sign(payload, {
            secret: process.env.JWT_REFRESH_SECRET,
            expiresIn: "7d",
        });

        // Store refresh token in DB
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId,
                expiresAt,
            },
        });

        // Get user details
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
            },
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user!.id,
                email: user!.email,
                firstName: user!.firstName,
                lastName: user!.lastName,
            },
        };
    }
}
