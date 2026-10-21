# OAuth module

OAuth 2.1 authorization server for the MCP endpoint. Overview in `apps/api/ARCHITECTURE.md`.

Security invariants (do not weaken):

- **Hash-only storage**: codes, access/refresh tokens and authorization request ids are stored as SHA-256 hashes (`oauth-crypto.ts`); raw values exist only in the response to the client.
- **No JWTs for MCP tokens**: tokens are opaque and looked up by hash on every request, so revocation is immediate.
- **Atomic consume**: authorization codes are consumed with a conditional `updateMany` (`usedAt: null`) and the count is checked; a second use revokes the grant. Refresh rotation conditions on `rotatedAt: null, revokedAt: null` inside the issuing transaction; the 30s grace claim conditions on `graceUsedAt: null`. Reuse after the grace, or presenting a grace-superseded (revoked) token on an active grant, revokes the grant.
- **Exact redirect matching**: `redirectUriMatches` in `redirect-uri.ts` only. Unknown client or mismatched redirect_uri is a 400 and never redirects.
- **Audience check**: `resource` must equal the MCP resource URL at authorize, and tokens are only valid for it.
- **Never log secrets**: no Authorization header, codes, tokens, verifiers or request ids in logs or errors.
- **Public URLs from env** (`OAuthConfigService`), never from Host headers.
- Public endpoints take `Record<string, unknown>` bodies/queries (the global ValidationPipe skips them); services parse with zod and throw `OAuthError`, rendered by `OAuthExceptionFilter`. Only the SPA-facing decision endpoint uses a class-validator DTO.
- Throttling is local (`ThrottlerGuard` + `@Throttle` per route); there is no global guard.
