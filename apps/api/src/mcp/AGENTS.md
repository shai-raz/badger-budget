# MCP module

Read-only MCP server for OAuth-authenticated users (`oauth/AGENTS.md`). Overview in `apps/api/ARCHITECTURE.md`.

- `tools/` is transport-independent (`McpToolDefinition` + `ToolRegistry`) and must not import the MCP SDK, Express or Nest HTTP types (enforced in `eslint.config.mjs`). Only `mcp-server.factory.ts` and `http/mcp.controller.ts` import `@modelcontextprotocol/*`.
- Stateless: a fresh server and transport per request, bound to the token's user, so tools never take a user id. The controller reads the body untyped from `@Req()` so the `ValidationPipe` can't strip JSON-RPC, and rejects batch arrays so one request is one tool call.
- Guard order: Origin check, authenticate, per-user throttle (keyed by user, so extra grants add no budget), require-auth.
- Output: compact JSON text (no `outputSchema`), lists columnar via `toColumnar`, errors `isError: true`. Output is an explicit allowlist, never a spread of a DB row (no `userId`, `externalId`, credentials). Every money row carries its own `currency`; never sum across currencies.
- `search_transactions` limits live in `tools/search-transactions.constants.ts`; it sets `truncated` and a `hint` when it cuts.

## Adding a tool

1. Add `tools/<name>.tool.ts` (zod 4 `inputSchema`, `annotations.readOnlyHint`, explicit output allowlist) and its spec, then add the class to `TOOL_CLASSES` in `mcp.module.ts`.
2. Tests cover user isolation (every query filters on the caller's `userId`) and the output allowlist.
3. `search_transactions` and `get_spending_report` mirror the filters of `transactions` and `reports` (hidden, transfers, currency); when those change, change these too.

To exercise it locally, point the MCP inspector CLI (`npx @modelcontextprotocol/inspector --cli`) at `http://localhost:3000/api/v1/mcp` with a bearer token from the OAuth flow.
