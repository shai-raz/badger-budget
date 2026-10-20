import { Injectable } from "@nestjs/common";
import { resolvePublicUrls } from "../config/public-url";

/**
 * Resolves the public URLs of the API and web app once, from environment only.
 * Never derived from request Host headers (they are attacker-controlled).
 */
@Injectable()
export class OAuthConfigService {
    readonly apiPublicUrl: string;
    readonly webAppUrl: string;

    constructor() {
        const urls = resolvePublicUrls();
        this.apiPublicUrl = urls.apiPublicUrl;
        this.webAppUrl = urls.webAppUrl;
    }

    get issuer(): string {
        return this.apiPublicUrl;
    }

    get mcpResourceUrl(): string {
        return `${this.apiPublicUrl}/api/v1/mcp`;
    }

    get protectedResourceMetadataUrl(): string {
        return `${this.apiPublicUrl}/.well-known/oauth-protected-resource/api/v1/mcp`;
    }

    get authorizationEndpoint(): string {
        return `${this.apiPublicUrl}/api/v1/oauth/authorize`;
    }

    get tokenEndpoint(): string {
        return `${this.apiPublicUrl}/api/v1/oauth/token`;
    }

    get registrationEndpoint(): string {
        return `${this.apiPublicUrl}/api/v1/oauth/register`;
    }

    get revocationEndpoint(): string {
        return `${this.apiPublicUrl}/api/v1/oauth/revoke`;
    }

    consentUrl(rawRequestId: string): string {
        return `${this.webAppUrl}/oauth/consent?request=${encodeURIComponent(rawRequestId)}`;
    }
}
