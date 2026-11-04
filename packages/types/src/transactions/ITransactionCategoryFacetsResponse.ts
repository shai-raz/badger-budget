/**
 * One category's row count within the filtered transaction view, returned by
 * `GET /transactions/category-facets`.
 */
export interface ITransactionCategoryFacet {
    /** Category id, or `null` for uncategorized transactions. */
    categoryId: string | null;
    /** Number of transactions in this category matching the facet filters. */
    count: number;
}

/**
 * Per-category counts for the transaction filters: the same filters as
 * `GET /transactions` (minus pagination, sort and the category filter), so the
 * category picker only offers categories that have rows in the view.
 *
 * The response is wrapped on purpose: a bare array would be mistaken for a
 * transaction list by the optimistic sweep in the web's
 * `useUpdateTransaction.mutation.ts`.
 */
export interface ITransactionCategoryFacetsResponse {
    categories: ITransactionCategoryFacet[];
}
