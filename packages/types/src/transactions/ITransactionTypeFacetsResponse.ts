import type { TransactionType } from "@badger/shared-data";

/**
 * One transaction type's row count within the filtered transaction view,
 * returned by `GET /transactions/type-facets`.
 */
export interface ITransactionTypeFacet {
    /** Transaction type. */
    type: TransactionType;
    /** Number of transactions of this type matching the facet filters. */
    count: number;
}

/**
 * Per-type counts for the transaction filters: the same filters as
 * `GET /transactions` (minus pagination, sort and the type filter), so the type
 * picker only offers types that have rows in the view.
 *
 * The response is wrapped on purpose: a bare array would be mistaken for a
 * transaction list by the optimistic sweep in the web's
 * `useUpdateTransaction.mutation.ts`.
 */
export interface ITransactionTypeFacetsResponse {
    types: ITransactionTypeFacet[];
}
