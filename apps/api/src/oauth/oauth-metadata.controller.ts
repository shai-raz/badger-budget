import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OAuthConfigService } from "./oauth-config.service";

/** RFC 8414 authorization server metadata. Served at the host root (excluded from the global prefix). */
@ApiTags("oauth")
@Controller(".well-known")
export class OAuthMetadataController {
    constructor(private readonly config: OAuthConfigService) {}

    @Get("oauth-authorization-server")
    getMetadata() {
        return {
            issuer: this.config.issuer,
            authorization_endpoint: this.config.authorizationEndpoint,
            token_endpoint: this.config.tokenEndpoint,
            registration_endpoint: this.config.registrationEndpoint,
            revocation_endpoint: this.config.revocationEndpoint,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            revocation_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["read"],
            authorization_response_iss_parameter_supported: true,
        };
    }
}
