import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientsService } from "./oauth-clients.service";
import { OAuthConfigService } from "./oauth-config.service";
import { OAuthConnectionsController } from "./oauth-connections.controller";
import { OAuthMetadataController } from "./oauth-metadata.controller";
import { OAuthTokensService } from "./oauth-tokens.service";
import { OAuthController } from "./oauth.controller";

@Module({
    // ThrottlerGuard is applied locally on these routes; same default as the throttler in AppModule.
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
    controllers: [OAuthMetadataController, OAuthController, OAuthConnectionsController],
    providers: [OAuthConfigService, OAuthClientsService, OAuthAuthorizationService, OAuthTokensService],
    exports: [OAuthTokensService, OAuthConfigService],
})
export class OAuthModule {}
