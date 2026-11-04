import { ApiProperty } from "@nestjs/swagger";
import type { ITransactionCategoryFacet, ITransactionCategoryFacetsResponse } from "@badger/types";

/** Row count for one category within the filtered view. */
export class TransactionCategoryFacetDto implements ITransactionCategoryFacet {
    @ApiProperty({
        type: String,
        nullable: true,
        description: "Category id, or null for uncategorized transactions.",
    })
    categoryId!: string | null;

    @ApiProperty({ description: "Number of transactions in this category matching the facet filters." })
    count!: number;
}

/**
 * Per-category counts returned by `GET /transactions/category-facets`. Wrapped
 * in an object (not a bare array) so the web's optimistic sweep never mistakes it
 * for a transaction list.
 */
export class TransactionCategoryFacetsResponseDto implements ITransactionCategoryFacetsResponse {
    @ApiProperty({ type: [TransactionCategoryFacetDto] })
    categories!: TransactionCategoryFacetDto[];
}
