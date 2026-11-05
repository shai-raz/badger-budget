import { ApiProperty } from "@nestjs/swagger";
import type { ITransactionAccountFacet, ITransactionAccountFacetsResponse } from "@badger/types";

/** Row count for one account within the filtered view. */
export class TransactionAccountFacetDto implements ITransactionAccountFacet {
    @ApiProperty({ type: String, description: "Account id." })
    accountId!: string;

    @ApiProperty({ description: "Number of transactions in this account matching the facet filters." })
    count!: number;
}

/**
 * Per-account counts returned by `GET /transactions/account-facets`. Wrapped
 * in an object (not a bare array) so the web's optimistic sweep never mistakes it
 * for a transaction list.
 */
export class TransactionAccountFacetsResponseDto implements ITransactionAccountFacetsResponse {
    @ApiProperty({ type: [TransactionAccountFacetDto] })
    accounts!: TransactionAccountFacetDto[];
}
