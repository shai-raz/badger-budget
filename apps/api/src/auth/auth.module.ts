import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { PrismaModule } from "../prisma/prisma.module";
import { AccountsModule } from "../accounts/accounts.module";
import { DemoModule } from "../demo/demo.module";
import { isGoogleAuthConfigured } from "./google-auth.config";
import { RegistrationPolicyService } from "./registration-policy.service";

@Module({
    imports: [
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>("JWT_SECRET"),
                signOptions: { expiresIn: "15m" },
            }),
            inject: [ConfigService],
        }),
        PrismaModule,
        AccountsModule,
        DemoModule,
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        RegistrationPolicyService,
        JwtStrategy,
        LocalStrategy,
        // A factory, not a bare class: it runs during NestFactory.create (after .env is loaded), while a
        // module-level check would run at import time, before ConfigModule has read .env.
        {
            provide: GoogleStrategy,
            useFactory: (authService: AuthService) =>
                isGoogleAuthConfigured() ? new GoogleStrategy(authService) : null,
            inject: [AuthService],
        },
    ],
    exports: [AuthService, RegistrationPolicyService],
})
export class AuthModule {}
