import { OmitType } from "@nestjs/swagger";
import { ListTransactionsQueryDto } from "./list-transactions-query.dto";

/**
 * Query params for `GET /transactions/summary`.
 *
 * Reuses the list endpoint's filters (search, type, categoryIds, date range,
 * legacy accountId/categoryId/budgetId) but drops the params that don't apply
 * to an aggregate:
 * - `page` / `limit` — the summary covers ALL matching rows, not a page.
 * - `sortBy` / `sortOrder` — ordering is meaningless for totals.
 * - `includeHidden` — hidden transactions are ALWAYS excluded from totals
 *   (product decision), so the toggle is intentionally not accepted here.
 *
 * `OmitType` from `@nestjs/swagger` preserves the class-validator metadata of
 * the retained properties, so the global ValidationPipe still validates them.
 */
export class SummaryTransactionsQueryDto extends OmitType(ListTransactionsQueryDto, [
    "page",
    "limit",
    "sortBy",
    "sortOrder",
    "includeHidden",
] as const) {}
