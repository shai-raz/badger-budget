import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { IOAuthConnection } from "@badger/types";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { OAuthConfigService } from "./oauth-config.service";
import { generateSecret, sha256Hex, verifyPkceS256 } from "./oauth-crypto";
import { OAuthError } from "./oauth-error";
import {
    ACCESS_TOKEN_TTL_SEC,
    LAST_USED_WRITE_INTERVAL_MS,
    REFRESH_GRACE_MS,
    REFRESH_TOKEN_TTL_MS,
} from "./oauth.constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const REVOKED_GRANT_RETENTION_MS = 30 * DAY_MS;

export interface McpAuthContext {
    grantId: string;
    userId: string;
    clientId: string;
    scopes: string[];
    expiresAt: Date;
    resource: string;
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    refresh_token: string;
    scope: string;
}

type IssuedPair = OAuthTokenResponse & { refreshTokenId: string };
type GrantRef = { id: string; scope: string };

const codeSchema = z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().min(1),
    code_verifier: z.string().min(1),
    client_id: z.string().min(1),
    resource: z.string().optional(),
});

const refreshSchema = z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    scope: z.string().optional(),
    resource: z.string().optional(),
});

const revokeSchema = z.object({
    token: z.string().min(1),
    token_type_hint: z.string().optional(),
    client_id: z.string().optional(),
});

const normalizeResource = (r: string) => r.replace(/\/+$/, "");

function stripInternal(pair: IssuedPair): OAuthTokenResponse {
    return {
        access_token: pair.access_token,
        token_type: pair.token_type,
        expires_in: pair.expires_in,
        refresh_token: pair.refresh_token,
        scope: pair.scope,
    };
}

@Injectable()
export class OAuthTokensService {
    private readonly logger = new Logger(OAuthTokensService.name);
    private lastPurgeAt = 0;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: OAuthConfigService,
    ) {}

    async exchangeCode(params: Record<string, unknown>): Promise<OAuthTokenResponse> {
        const parsed = codeSchema.safeParse(params ?? {});
        if (!parsed.success) {
            const badType = parsed.error.issues.some((i) => i.path[0] === "grant_type");
            throw badType
                ? new OAuthError("unsupported_grant_type", "grant_type must be authorization_code")
                : new OAuthError("invalid_request", "Missing or invalid token request parameters");
        }
        const p = parsed.data;
        void this.purgeExpiredOpportunistically();

        const code = await this.prisma.oAuthAuthorizationCode.findUnique({
            where: { codeHash: sha256Hex(p.code) },
            include: { grant: { include: { client: true } } },
        });
        if (!code) throw new OAuthError("invalid_grant", "Invalid authorization code");
        const grant = code.grant;
        if (grant.client.clientId !== p.client_id) throw new OAuthError("invalid_grant", "Client mismatch");
        if (p.redirect_uri !== code.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
        if (code.expiresAt.getTime() <= Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired");
        if (!verifyPkceS256(p.code_verifier, code.codeChallenge)) {
            throw new OAuthError("invalid_grant", "PKCE verification failed");
        }
        if (p.resource !== undefined && normalizeResource(p.resource) !== normalizeResource(grant.resource)) {
            throw new OAuthError("invalid_target", "resource does not match the authorized resource");
        }
        if (grant.revokedAt) throw new OAuthError("invalid_grant", "Grant has been revoked");

        // Consuming the code and issuing the pair commit together, so a transient failure rolls usedAt back
        // and the client's retry is not mistaken for a replay.
        const pair = await this.prisma.$transaction(async (tx) => {
            const consumed = await tx.oAuthAuthorizationCode.updateMany({
                where: { id: code.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            if (consumed.count !== 1) return null;
            return this.issueTokenPair(tx, grant);
        });
        if (!pair) {
            await this.revokeGrant(grant.id);
            throw new OAuthError("invalid_grant", "Authorization code already used");
        }
        return stripInternal(pair);
    }

    async refresh(params: Record<string, unknown>): Promise<OAuthTokenResponse> {
        const parsed = refreshSchema.safeParse(params ?? {});
        if (!parsed.success) {
            const badType = parsed.error.issues.some((i) => i.path[0] === "grant_type");
            throw badType
                ? new OAuthError("unsupported_grant_type", "grant_type must be refresh_token")
                : new OAuthError("invalid_request", "Missing or invalid token request parameters");
        }
        const p = parsed.data;
        void this.purgeExpiredOpportunistically();

        const token = await this.prisma.oAuthRefreshToken.findUnique({
            where: { tokenHash: sha256Hex(p.refresh_token) },
            include: { grant: { include: { client: true } } },
        });
        if (!token) throw new OAuthError("invalid_grant", "Invalid refresh token");
        const grant = token.grant;
        if (grant.client.clientId !== p.client_id) throw new OAuthError("invalid_grant", "Client mismatch");
        if (grant.revokedAt) throw new OAuthError("invalid_grant", "Refresh token revoked");
        if (token.revokedAt) {
            // Every other revocation path also revokes the grant, so a revoked token on an active grant was
            // superseded by the grace path. Presenting it now means someone replayed it: treat as reuse.
            await this.revokeGrant(grant.id);
            throw new OAuthError("invalid_grant", "Refresh token reuse detected");
        }
        if (token.expiresAt.getTime() <= Date.now()) throw new OAuthError("invalid_grant", "Refresh token expired");

        if (p.scope !== undefined) {
            const granted = grant.scope.split(" ").filter(Boolean);
            const requested = p.scope.split(" ").filter(Boolean);
            if (!requested.every((s) => granted.includes(s))) {
                throw new OAuthError("invalid_scope", "Requested scope exceeds the granted scope");
            }
        }
        if (p.resource !== undefined && normalizeResource(p.resource) !== normalizeResource(grant.resource)) {
            throw new OAuthError("invalid_target", "resource does not match the authorized resource");
        }

        if (!token.rotatedAt) {
            // Rotation, issuance and replacedById commit together: a concurrent loser blocks on the row lock
            // and then sees the committed successor (grace path); a failed issue rolls rotatedAt back.
            const pair = await this.prisma.$transaction(async (tx) => {
                const rotated = await tx.oAuthRefreshToken.updateMany({
                    where: { id: token.id, rotatedAt: null, revokedAt: null },
                    data: { rotatedAt: new Date() },
                });
                if (rotated.count !== 1) return null;
                const issued = await this.issueTokenPair(tx, grant);
                await tx.oAuthRefreshToken.update({
                    where: { id: token.id },
                    data: { replacedById: issued.refreshTokenId },
                });
                return issued;
            });
            if (pair) return stripInternal(pair);
            // Lost a race: another request rotated it first. Treat as reuse.
            const fresh = await this.prisma.oAuthRefreshToken.findUnique({ where: { id: token.id } });
            return this.handleReuse(fresh ?? { ...token, rotatedAt: new Date() }, grant);
        }
        return this.handleReuse(token, grant);
    }

    /** RFC 7009. Always resolves, even for unknown tokens. */
    async revoke(params: Record<string, unknown>): Promise<void> {
        const parsed = revokeSchema.safeParse(params ?? {});
        if (!parsed.success) return;
        const { token, token_type_hint: hint, client_id: clientId } = parsed.data;
        const hash = sha256Hex(token);
        const include = { grant: { include: { client: true } } };

        const findAccess = () => this.prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hash }, include });
        const findRefresh = () => this.prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash }, include });

        let access = null;
        let refresh = null;
        if (hint === "refresh_token") {
            refresh = await findRefresh();
            if (!refresh) access = await findAccess();
        } else {
            access = await findAccess();
            if (!access) refresh = await findRefresh();
        }

        const found = access ?? refresh;
        if (!found) return;
        if (clientId !== undefined && found.grant.client.clientId !== clientId) return;

        if (access) {
            await this.prisma.oAuthAccessToken.updateMany({
                where: { id: access.id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        } else if (refresh) {
            await this.revokeGrant(refresh.grantId);
        }
    }

    async revokeGrant(grantId: string): Promise<void> {
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            await tx.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: now } });
            await tx.oAuthRefreshToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
            await tx.oAuthAccessToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
        });
    }

    async validateAccessToken(raw: string): Promise<McpAuthContext | null> {
        if (typeof raw !== "string" || !raw.startsWith("bdg_at_")) return null;
        const token = await this.prisma.oAuthAccessToken.findUnique({
            where: { tokenHash: sha256Hex(raw) },
            include: {
                grant: { include: { client: true, user: { select: { id: true, deletedAt: true } } } },
            },
        });
        if (!token) return null;
        const grant = token.grant;
        const now = Date.now();
        if (token.revokedAt || token.expiresAt.getTime() <= now) return null;
        if (grant.revokedAt || grant.user.deletedAt) return null;
        if (grant.resource !== this.config.mcpResourceUrl) return null;

        if (!grant.lastUsedAt || now - grant.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
            void Promise.resolve(
                this.prisma.oAuthGrant.updateMany({ where: { id: grant.id }, data: { lastUsedAt: new Date(now) } }),
            ).catch((err) => this.logger.warn(`Failed to update grant lastUsedAt: ${String(err)}`));
        }

        return {
            grantId: grant.id,
            userId: grant.userId,
            clientId: grant.client.clientId,
            scopes: grant.scope.split(" ").filter(Boolean),
            expiresAt: token.expiresAt,
            resource: grant.resource,
        };
    }

    async listConnections(userId: string): Promise<IOAuthConnection[]> {
        const grants = await this.prisma.oAuthGrant.findMany({
            where: { userId, revokedAt: null },
            include: { client: true },
            orderBy: { createdAt: "desc" },
        });
        return grants.map((g) => ({
            id: g.id,
            clientName: g.client.clientName,
            createdAt: g.createdAt.toISOString(),
            lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
            scopes: g.scope.split(" ").filter(Boolean),
        }));
    }

    async revokeConnection(userId: string, grantId: string): Promise<void> {
        const grant = await this.prisma.oAuthGrant.findFirst({ where: { id: grantId, userId, revokedAt: null } });
        if (!grant) throw new NotFoundException("Connection not found");
        await this.revokeGrant(grant.id);
    }

    /** Hard-deletes rows more than a day past expiry, and grants revoked more than 30 days ago. */
    async purgeExpired(): Promise<void> {
        const now = Date.now();
        const cutoff = new Date(now - DAY_MS);
        await this.prisma.oAuthAuthorizationCode.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        await this.prisma.oAuthAccessToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        await this.prisma.oAuthRefreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        await this.prisma.oAuthAuthorizationRequest.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        await this.prisma.oAuthGrant.deleteMany({
            where: { revokedAt: { lt: new Date(now - REVOKED_GRANT_RETENTION_MS) } },
        });
    }

    private async purgeExpiredOpportunistically(): Promise<void> {
        const now = Date.now();
        if (now - this.lastPurgeAt < PURGE_INTERVAL_MS) return;
        this.lastPurgeAt = now;
        try {
            await this.purgeExpired();
        } catch (err) {
            this.logger.warn(`OAuth purge failed: ${String(err)}`);
        }
    }

    private async handleReuse(
        token: {
            id: string;
            rotatedAt: Date | null;
            graceUsedAt: Date | null;
            replacedById: string | null;
        },
        grant: GrantRef,
    ): Promise<OAuthTokenResponse> {
        const reuse = async (): Promise<never> => {
            await this.revokeGrant(grant.id);
            throw new OAuthError("invalid_grant", "Refresh token reuse detected");
        };

        const withinGrace =
            token.rotatedAt !== null &&
            Date.now() - token.rotatedAt.getTime() <= REFRESH_GRACE_MS &&
            token.graceUsedAt === null &&
            token.replacedById !== null;
        if (!withinGrace) return reuse();

        const successor = await this.prisma.oAuthRefreshToken.findUnique({
            where: { id: token.replacedById as string },
        });
        if (!successor || successor.rotatedAt || successor.revokedAt) return reuse();

        // The grace claim commits with the issuance: a failed issue rolls graceUsedAt back so the client's
        // retry is still a valid grace request rather than looking like reuse.
        const pair = await this.prisma.$transaction(async (tx) => {
            const now = new Date();
            const claimed = await tx.oAuthRefreshToken.updateMany({
                where: { id: token.id, graceUsedAt: null },
                data: { graceUsedAt: now },
            });
            if (claimed.count !== 1) return null;
            await tx.oAuthRefreshToken.updateMany({
                where: { id: successor.id, revokedAt: null },
                data: { revokedAt: now },
            });
            await tx.oAuthAccessToken.updateMany({
                where: { refreshTokenId: successor.id, revokedAt: null },
                data: { revokedAt: now },
            });
            const issued = await this.issueTokenPair(tx, grant);
            await tx.oAuthRefreshToken.update({
                where: { id: token.id },
                data: { replacedById: issued.refreshTokenId },
            });
            return issued;
        });
        if (!pair) return reuse();
        return stripInternal(pair);
    }

    private async issueTokenPair(tx: Prisma.TransactionClient, grant: GrantRef): Promise<IssuedPair> {
        const at = generateSecret("bdg_at");
        const rt = generateSecret("bdg_rt");
        const now = Date.now();
        const refresh = await tx.oAuthRefreshToken.create({
            data: { tokenHash: sha256Hex(rt), grantId: grant.id, expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS) },
        });
        await tx.oAuthAccessToken.create({
            data: {
                tokenHash: sha256Hex(at),
                grantId: grant.id,
                refreshTokenId: refresh.id,
                expiresAt: new Date(now + ACCESS_TOKEN_TTL_SEC * 1000),
            },
        });
        return {
            access_token: at,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_TTL_SEC,
            refresh_token: rt,
            scope: grant.scope,
            refreshTokenId: refresh.id,
        };
    }
}
