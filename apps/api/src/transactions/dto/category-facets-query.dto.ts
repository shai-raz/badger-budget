import { OmitType } from "@nestjs/swagger";
import { ListTransactionsQueryDto } from "./list-transactions-query.dto";

/**
 * Query params for `GET /transactions/category-facets`.
 *
 * Reuses the list endpoint's filters (search, types, accountIds, date range,
 * legacy budgetId) but drops the params that don't apply to per-category counts:
 * - `page` / `limit` — the counts cover ALL matching rows, not a page.
 * - `sortBy` / `sortOrder` — ordering is meaningless for counts.
 * - `categoryIds` / `categoryId` — the counts ignore the category selection, so
 *   every category that has rows in the rest of the view stays offered while one
 *   is picked.
 *
 * `includeHidden` is kept: the facet follows the list's show-hidden toggle.
 *
 * `OmitType` from `@nestjs/swagger` preserves the class-validator metadata of
 * the retained properties, so the global ValidationPipe still validates them.
 */
export class CategoryFacetsQueryDto extends OmitType(ListTransactionsQueryDto, [
    "page",
    "limit",
    "sortBy",
    "sortOrder",
    "categoryIds",
    "categoryId",
] as const) {}
