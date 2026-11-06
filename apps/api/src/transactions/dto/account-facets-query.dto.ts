import { OmitType } from "@nestjs/swagger";
import { ListTransactionsQueryDto } from "./list-transactions-query.dto";

/**
 * Query params for `GET /transactions/account-facets`.
 *
 * Reuses the list endpoint's filters (search, types, categoryIds, date range,
 * legacy budgetId) but drops the params that don't apply to per-account counts:
 * - `page` / `limit` — the counts cover ALL matching rows, not a page.
 * - `sortBy` / `sortOrder` — ordering is meaningless for counts.
 * - `accountIds` — the counts ignore the account selection, so every account
 *   that has rows in the rest of the view stays offered while one is picked.
 *
 * `includeHidden` is kept: the facet follows the list's show-hidden toggle.
 *
 * `OmitType` from `@nestjs/swagger` preserves the class-validator metadata of
 * the retained properties, so the global ValidationPipe still validates them.
 */
export class AccountFacetsQueryDto extends OmitType(ListTransactionsQueryDto, [
    "page",
    "limit",
    "sortBy",
    "sortOrder",
    "accountIds",
] as const) {}
