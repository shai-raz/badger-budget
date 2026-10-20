import { Injectable, NotFoundException } from "@nestjs/common";
import type { IOAuthConsentRequest, IOAuthDecisionResponse } from "@badger/types";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { OAuthClientsService } from "./oauth-clients.service";
import { OAuthConfigService } from "./oauth-config.service";
import { generateSecret, isValidCodeChallenge, sha256Hex } from "./oauth-crypto";
import { OAuthError } from "./oauth-error";
import { AUTH_CODE_TTL_MS, AUTH_REQUEST_TTL_MS, OAUTH_SCOPE_READ, SUPPORTED_SCOPES } from "./oauth.constants";
import { isLoopbackRedirect, isVerifiedClaudeRedirect, redirectDisplay, redirectUriMatches } from "./redirect-uri";

const NOT_FOUND = "Authorization request not found or expired";

// Each field is parsed on its own so that one bad (e.g. array-valued) param is reported precisely.
const fields = {
    response_type: z.string(),
    client_id: z.string().min(1),
    redirect_uri: z.string().min(1),
    code_challenge: z.string(),
    code_challenge_method: z.string(),
    state: z.string().max(1024),
    scope: z.string(),
    resource: z.string(),
};
type Field = keyof typeof fields;

@Injectable()
export class OAuthAuthorizationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: OAuthConfigService,
        private readonly clients: OAuthClientsService,
    ) {}

    async startAuthorization(query: Record<string, unknown>): Promise<{ redirectUrl: string }> {
        const q = query ?? {};
        // undefined = absent, null = present but invalid (wrong type, too long, empty required value)
        const get = (key: Field): string | undefined | null => {
            if (q[key] === undefined) return undefined;
            const r = fields[key].safeParse(q[key]);
            return r.success ? r.data : null;
        };

        // Step A: errors that must never redirect.
        const clientId = get("client_id");
        if (!clientId) throw new OAuthError("invalid_request", "client_id is required");
        const client = await this.clients.findByClientId(clientId);
        if (!client) throw new OAuthError("invalid_client", "Unknown client_id");
        const redirectUri = get("redirect_uri");
        if (!redirectUri) throw new OAuthError("invalid_request", "redirect_uri is required");
        if (!client.redirectUris.some((registered) => redirectUriMatches(registered, redirectUri))) {
            throw new OAuthError("invalid_request", "redirect_uri is not registered for this client");
        }

        // Step B: redirect_uri is registered, but an unverified https redirect must not be reachable without
        // user interaction (RFC 9700 4.11.2), so only verified, loopback and private-scheme URIs get error redirects.
        const redirectable =
            isVerifiedClaudeRedirect(redirectUri) || isLoopbackRedirect(redirectUri) || !/^https?:/i.test(redirectUri);
        const rawState = get("state");
        const state = rawState || undefined;
        const fail = (error: string, description: string) => {
            if (!redirectable) throw new OAuthError(error, description);
            return { redirectUrl: this.buildErrorRedirect(redirectUri, error, description, state) };
        };

        if (rawState === null) return fail("invalid_request", "Invalid state");
        if (get("response_type") !== "code") return fail("unsupported_response_type", "response_type must be code");

        const challenge = get("code_challenge");
        if (!challenge || !isValidCodeChallenge(challenge)) return fail("invalid_request", "Invalid code_challenge");
        if (get("code_challenge_method") !== "S256") {
            return fail("invalid_request", "code_challenge_method must be S256");
        }

        const rawScope = get("scope");
        if (rawScope === null) return fail("invalid_scope", "Invalid scope");
        const scopes = (rawScope ?? "").split(" ").filter(Boolean);
        if (scopes.length === 0) scopes.push(OAUTH_SCOPE_READ);
        if (!scopes.every((s) => SUPPORTED_SCOPES.includes(s))) return fail("invalid_scope", "Unsupported scope");

        const rawResource = get("resource");
        if (rawResource === null) return fail("invalid_target", "Invalid resource");
        const resource = rawResource === undefined ? this.config.mcpResourceUrl : rawResource.replace(/\/$/, "");
        if (resource !== this.config.mcpResourceUrl) return fail("invalid_target", "Unknown resource");

        const raw = generateSecret("bdg_ar");
        await this.prisma.oAuthAuthorizationRequest.create({
            data: {
                requestHash: sha256Hex(raw),
                clientId: client.id,
                redirectUri,
                codeChallenge: challenge,
                state: state ?? null,
                scope: scopes.join(" "),
                resource,
                expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
            },
        });
        return { redirectUrl: this.config.consentUrl(raw) };
    }

    async getConsentRequest(rawId: string, userId: string): Promise<IOAuthConsentRequest> {
        const requestHash = sha256Hex(rawId);
        const now = new Date();
        const load = () =>
            this.prisma.oAuthAuthorizationRequest.findUnique({ where: { requestHash }, include: { client: true } });
        const usable = (r: Awaited<ReturnType<typeof load>>) => !!r && !r.consumedAt && r.expiresAt > now;

        let request = await load();
        if (!request || !usable(request) || (request.userId && request.userId !== userId)) {
            throw new NotFoundException(NOT_FOUND);
        }

        if (!request.userId) {
            const bound = await this.prisma.oAuthAuthorizationRequest.updateMany({
                where: { id: request.id, userId: null },
                data: { userId },
            });
            if (bound.count === 0) {
                request = await load();
                if (!request || !usable(request) || request.userId !== userId) throw new NotFoundException(NOT_FOUND);
            }
        }

        return {
            clientName: request.client.clientName,
            redirectDisplay: redirectDisplay(request.redirectUri),
            verified: isVerifiedClaudeRedirect(request.redirectUri),
            loopback: isLoopbackRedirect(request.redirectUri),
            scopes: request.scope.split(" "),
            expiresAt: request.expiresAt.toISOString(),
        };
    }

    async decide(rawId: string, userId: string, approve: boolean): Promise<IOAuthDecisionResponse> {
        const requestHash = sha256Hex(rawId);
        const now = new Date();
        const consumed = await this.prisma.oAuthAuthorizationRequest.updateMany({
            where: { requestHash, consumedAt: null, expiresAt: { gt: now }, OR: [{ userId: null }, { userId }] },
            data: { consumedAt: now, userId },
        });
        if (consumed.count !== 1) throw new NotFoundException(NOT_FOUND);

        const request = await this.prisma.oAuthAuthorizationRequest.findUnique({
            where: { requestHash },
            include: { client: true },
        });
        if (!request) throw new NotFoundException(NOT_FOUND);
        const state = request.state ?? undefined;

        if (!approve) {
            return {
                redirectUrl: this.buildErrorRedirect(
                    request.redirectUri,
                    "access_denied",
                    "The user denied the request",
                    state,
                ),
            };
        }

        const code = generateSecret("bdg_ac");
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.oAuthGrant.findMany({
                where: { userId, clientId: request.clientId, revokedAt: null },
                select: { id: true },
            });
            if (existing.length > 0) {
                const grantIds = existing.map((g) => g.id);
                await tx.oAuthGrant.updateMany({ where: { id: { in: grantIds } }, data: { revokedAt: now } });
                await tx.oAuthAccessToken.updateMany({
                    where: { grantId: { in: grantIds }, revokedAt: null },
                    data: { revokedAt: now },
                });
                await tx.oAuthRefreshToken.updateMany({
                    where: { grantId: { in: grantIds }, revokedAt: null },
                    data: { revokedAt: now },
                });
            }
            const grant = await tx.oAuthGrant.create({
                data: { userId, clientId: request.clientId, scope: request.scope, resource: request.resource },
            });
            await tx.oAuthAuthorizationCode.create({
                data: {
                    codeHash: sha256Hex(code),
                    grantId: grant.id,
                    codeChallenge: request.codeChallenge,
                    redirectUri: request.redirectUri,
                    expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
                },
            });
            await tx.oAuthClient.update({ where: { id: request.clientId }, data: { lastUsedAt: now } });
        });

        const url = new URL(request.redirectUri);
        url.searchParams.set("code", code);
        if (state) url.searchParams.set("state", state);
        url.searchParams.set("iss", this.config.issuer);
        return { redirectUrl: url.toString() };
    }

    private buildErrorRedirect(redirectUri: string, error: string, description: string, state?: string): string {
        const url = new URL(redirectUri);
        url.searchParams.set("error", error);
        url.searchParams.set("error_description", description);
        if (state) url.searchParams.set("state", state);
        url.searchParams.set("iss", this.config.issuer);
        return url.toString();
    }
}
