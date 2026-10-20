import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { OAuthConfigService } from "../../oauth/oauth-config.service";

/** RFC 9728 protected resource metadata. Served at the host root (excluded from the global prefix). */
@ApiExcludeController()
@Controller(".well-known")
export class ProtectedResourceController {
    constructor(private readonly config: OAuthConfigService) {}

    @Get(["oauth-protected-resource", "oauth-protected-resource/api/v1/mcp"])
    @Header("Cache-Control", "public, max-age=300")
    getMetadata() {
        return {
            resource: this.config.mcpResourceUrl,
            authorization_servers: [this.config.issuer],
            scopes_supported: ["read"],
            bearer_methods_supported: ["header"],
            resource_name: "Badger Budget",
        };
    }
}
