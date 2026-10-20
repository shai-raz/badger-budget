import { ApiProperty } from "@nestjs/swagger";
import type { PaginatedResponse } from "@badger/types";
import { TransactionResponseDto } from "./transaction-response.dto";

/**
 * Paginated envelope returned by `GET /transactions` when the `page` query
 * param is present. Mirrors the shared `PaginatedResponse<T>` generic.
 */
export class PaginatedTransactionsResponseDto implements PaginatedResponse<TransactionResponseDto> {
    @ApiProperty({ type: [TransactionResponseDto] })
    data: TransactionResponseDto[];

    @ApiProperty({ description: "Total number of transactions matching the filters (ignoring pagination)." })
    total: number;

    @ApiProperty({ description: "Current 1-based page number." })
    page: number;

    @ApiProperty({ description: "Page size used for this response." })
    pageSize: number;

    @ApiProperty({ description: "Total number of pages for the current filters and page size." })
    totalPages: number;
}
