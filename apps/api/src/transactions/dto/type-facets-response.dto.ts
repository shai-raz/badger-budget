import { ApiProperty } from "@nestjs/swagger";
import { TRANSACTION_TYPES, type TransactionType } from "@badger/shared-data";
import type { ITransactionTypeFacet, ITransactionTypeFacetsResponse } from "@badger/types";

/** Row count for one transaction type within the filtered view. */
export class TransactionTypeFacetDto implements ITransactionTypeFacet {
    @ApiProperty({ type: String, enum: [...TRANSACTION_TYPES], description: "Transaction type." })
    type!: TransactionType;

    @ApiProperty({ description: "Number of transactions of this type matching the facet filters." })
    count!: number;
}

/**
 * Per-type counts returned by `GET /transactions/type-facets`. Wrapped in an
 * object (not a bare array) so the web's optimistic sweep never mistakes it for
 * a transaction list.
 */
export class TransactionTypeFacetsResponseDto implements ITransactionTypeFacetsResponse {
    @ApiProperty({ type: [TransactionTypeFacetDto] })
    types!: TransactionTypeFacetDto[];
}
