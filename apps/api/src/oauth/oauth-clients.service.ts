import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { CLIENT_NAME_MAX, DCR_MAX_REDIRECT_URIS, UNUSED_CLIENT_PRUNE_DAYS } from "./oauth.constants";
import { generateClientId } from "./oauth-crypto";
import { OAuthError } from "./oauth-error";
import { isAllowedRedirectUri } from "./redirect-uri";

const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_CLIENT_NAME = "Unnamed MCP client";
// eslint-disable-next-line no-control-regex
const STRIP_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

const registrationSchema = z.object({
    redirect_uris: z.array(z.string()).min(1).max(DCR_MAX_REDIRECT_URIS),
    client_name: z.string().optional(),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
});

export interface RegisteredClient {
    client_id: string;
    client_id_issued_at: number;
    client_name: string;
    redirect_uris: string[];
    grant_types: string[];
    response_types: string[];
    token_endpoint_auth_method: "none";
}

@Injectable()
export class OAuthClientsService {
    private lastPruneAt = 0;

    constructor(private readonly prisma: PrismaService) {}

    async register(body: Record<string, unknown>): Promise<RegisteredClient> {
        const parsed = registrationSchema.safeParse(body ?? {});
        if (!parsed.success) {
            const onRedirects = parsed.error.issues.some((i) => i.path[0] === "redirect_uris");
            throw onRedirects
                ? new OAuthError("invalid_redirect_uri", `redirect_uris must be 1-${DCR_MAX_REDIRECT_URIS} strings`)
                : new OAuthError("invalid_client_metadata", "Invalid client metadata");
        }
        const data = parsed.data;
        if (!data.redirect_uris.every(isAllowedRedirectUri)) {
            throw new OAuthError("invalid_redirect_uri", "One or more redirect_uris are not allowed");
        }
        if (data.token_endpoint_auth_method !== undefined && data.token_endpoint_auth_method !== "none") {
            throw new OAuthError("invalid_client_metadata", 'token_endpoint_auth_method must be "none"');
        }
        const allowedGrants = ["authorization_code", "refresh_token"];
        if (data.grant_types && !data.grant_types.every((g) => allowedGrants.includes(g))) {
            throw new OAuthError("invalid_client_metadata", "Unsupported grant_types");
        }
        if (data.response_types && !(data.response_types.length === 1 && data.response_types[0] === "code")) {
            throw new OAuthError("invalid_client_metadata", 'response_types must be ["code"]');
        }

        const clientName =
            (data.client_name ?? "").replace(STRIP_CHARS, "").trim().slice(0, CLIENT_NAME_MAX).trim() ||
            DEFAULT_CLIENT_NAME;

        await this.pruneUnusedClients();

        const row = await this.prisma.oAuthClient.create({
            data: { clientId: generateClientId(), clientName, redirectUris: data.redirect_uris },
        });

        return {
            client_id: row.clientId,
            client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
            client_name: row.clientName,
            redirect_uris: row.redirectUris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        };
    }

    findByClientId(clientId: string) {
        return this.prisma.oAuthClient.findUnique({ where: { clientId } });
    }

    private async pruneUnusedClients(): Promise<void> {
        const now = Date.now();
        if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) return;
        this.lastPruneAt = now;
        await this.prisma.oAuthClient.deleteMany({
            where: {
                createdAt: { lt: new Date(now - UNUSED_CLIENT_PRUNE_DAYS * 24 * 60 * 60 * 1000) },
                grants: { none: {} },
            },
        });
    }
}
