import { Controller, Post, Body, UseGuards, Get, Req, Res, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { Response } from "express";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post("register")
    @ApiOperation({ summary: "Register a new user" })
    @ApiResponse({ status: 201, description: "User registered successfully" })
    @ApiResponse({ status: 403, description: "Registration closed" })
    @ApiResponse({ status: 409, description: "Email already registered" })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post("login")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Login with email and password" })
    @ApiResponse({ status: 200, description: "Login successful" })
    @ApiResponse({ status: 401, description: "Invalid credentials" })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post("refresh")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Refresh access token" })
    @ApiResponse({ status: 200, description: "Token refreshed successfully" })
    @ApiResponse({ status: 401, description: "Invalid refresh token" })
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshTokens(refreshTokenDto.refreshToken);
    }

    @Post("logout")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Logout user" })
    @ApiResponse({ status: 204, description: "Logout successful" })
    async logout(@CurrentUser() user: any, @Body() refreshTokenDto: RefreshTokenDto) {
        await this.authService.logout(user.id, refreshTokenDto.refreshToken);
    }

    @Get("me")
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Get current user profile" })
    @ApiResponse({ status: 200, description: "User profile" })
    @ApiResponse({ status: 401, description: "Unauthorized" })
    getProfile(@CurrentUser() user: any) {
        return user;
    }

    @Get("google")
    @UseGuards(GoogleAuthGuard)
    @ApiOperation({ summary: "Initiate Google OAuth login" })
    async googleAuth() {
        // Guard redirects to Google
    }

    @Get("google/callback")
    @UseGuards(GoogleAuthGuard)
    @ApiOperation({ summary: "Google OAuth callback" })
    async googleAuthCallback(@Req() req: any, @Res() res: Response) {
        // Generate tokens for the user
        const tokens = await this.authService.generateTokens(req.user.id, req.user.email);

        // In production, you'd redirect to your frontend with tokens
        // For now, return JSON
        return res.json(tokens);
    }

    @Post("google/mobile")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Authenticate with Google authorization code (mobile)" })
    @ApiResponse({ status: 200, description: "Authentication successful" })
    @ApiResponse({ status: 401, description: "Invalid authorization code" })
    async googleAuthMobile(@Body() body: { code: string; redirectUri: string; codeVerifier: string }) {
        console.log("[BACKEND] Google auth mobile endpoint called");
        console.log("[BACKEND] Received authorization code");
        const result = await this.authService.exchangeGoogleCode(body.code, body.redirectUri, body.codeVerifier);
        console.log("[BACKEND] Authentication successful, returning tokens");
        return result;
    }
}
