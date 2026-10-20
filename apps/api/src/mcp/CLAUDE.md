# MCP module

- `tools/` is the transport-independent tool layer: `McpToolDefinition`s plus `ToolRegistry`. It must not import the MCP SDK, Express or Nest HTTP types (enforced in `eslint.config.mjs`).
- `mcp-server.factory.ts` and `http/mcp.controller.ts` are the only files that import `@modelcontextprotocol/*`. The factory turns a `ToolRegistry` into an `McpServer` bound to one user. Build a fresh server per request.
- SDK: official v2 (`@modelcontextprotocol/server`, `/node`; `/client` as devDependency for the in-memory round-trip test). Spike passed: types resolve under `nodenext`, the packages ship CJS export conditions so @swc/jest needs no config, and `NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` in a Nest `@Req()/@Res()` handler works with the MCP inspector CLI (tools/list, tools/call). `registerTool` takes a `z.object` (zod 4) as `inputSchema`.
- `http/mcp.controller.ts` serves `POST /api/v1/mcp` (stateless: server + transport per request; body read untyped from `@Req()` so the ValidationPipe cannot strip JSON-RPC); GET/DELETE return 405. Guards run Origin, authenticate, per-user throttle (120/min), require-auth. JSON-RPC batch arrays are rejected with -32600 so one request is one tool call.
- Tool results are compact JSON text only (no `outputSchema`/`structuredContent`); errors are `isError: true` text.
- Tools (`tools/`): `list_accounts`, `list_categories`, `search_transactions`, `get_spending_report`, `get_budget_status`. All read-only, registered in `mcp.module.ts` via the `MCP_TOOLS` token; add a tool by adding its class to `TOOL_CLASSES` there.
- Output conventions: columnar `{ columns, rows, rowCount, truncated, ... }` via `toColumnar`; missing values are `null`; amounts are plain positive numbers (direction comes from `type`); every money row carries its own `currency`, never sum across currencies. Output is an explicit allowlist, never a spread of a DB row (no `userId`, `externalId`, credentials).
- `search_transactions` limits live in `tools/search-transactions.constants.ts`: `SEARCH_MAX_ROWS = 1000`, `SEARCH_MAX_CHARS = 60_000`, page size 200 (max 500), group limit 50 (max 500). Hidden transactions (card payoffs, internal transfers) are excluded unless `includeHidden: true`.

## Adding a tool

1. Add `tools/<name>.tool.ts` (class implementing `McpToolDefinition`, zod 4 `inputSchema`, `annotations.readOnlyHint`, explicit output allowlist) and its spec.
2. Add the class to `TOOL_CLASSES` in `mcp.module.ts` (it feeds the `MCP_TOOLS` factory).
3. Tests must cover user isolation (every query filters on the caller's `userId`) and the output allowlist (no `userId`, `externalId`, credentials).
4. `search_transactions` and `get_spending_report` mirror the filters of `transactions`/`reports`: when those services change filters (hidden, transfers, currency), mirror the change here.

## Local verification recipe

Stack: `docker compose -f docker-compose.dev.yml up -d`, `pnpm dev:api`; `API_PUBLIC_URL`/`WEB_APP_URL` unset (defaults `localhost:3000` / `localhost:3001`). Keep the script out of the repo.

1. `curl -i -X POST localhost:3000/api/v1/mcp` -> 401 with `WWW-Authenticate`; `/.well-known/oauth-protected-resource/api/v1/mcp` and `/.well-known/oauth-authorization-server` return JSON.
2. `POST /api/v1/oauth/register` `{client_name, redirect_uris:["http://localhost:9999/cb"]}`; PKCE S256 verifier/challenge; `GET /oauth/authorize` with `scope=read` and `redirect_uri=http://localhost:7777/cb` (another loopback port; the unsupported scope `mcp` fails with `invalid_scope`) -> 302, take `request` from `Location`.
3. `POST /auth/login` as `demo@demo.demo` / `demo123QWEasd` (login is throttled, about 10/min); with the JWT: `GET /oauth/requests/:id`, `POST .../decision {approve:true}` -> `redirectUrl` carries `code`. `POST /oauth/token` (form) gives the tokens.
4. Refresh rotates. Reusing a code returns `invalid_grant` and also revokes the grant, so test it last. `approve:false` redirects with `error=access_denied` and adds no entry to `GET /oauth/connections`.
5. `npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/v1/mcp --transport http --header "Authorization: Bearer <token>" --method tools/list`, then `--method tools/call --tool-name <tool> --tool-arg k=v` for every tool (`search_transactions` with `startDate`/`endDate`, also `groupBy=category|month`; `get_spending_report` with a month; `get_budget_status`).
6. `DELETE /oauth/connections/:id` (JWT): the access token gets 401 at once, the refresh token `invalid_grant`.

Browser checks (not scriptable): MCP Inspector UI (Streamable HTTP, OAuth through the web consent page with `pnpm dev:web`) and `claude mcp add --transport http badger-local http://localhost:3000/api/v1/mcp` then `/mcp`.
