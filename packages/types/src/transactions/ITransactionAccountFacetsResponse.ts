/**
 * One account's row count within the filtered transaction view, returned by
 * `GET /transactions/account-facets`.
 */
export interface ITransactionAccountFacet {
    /** Account id. */
    accountId: string;
    /** Number of transactions in this account matching the facet filters. */
    count: number;
}

/**
 * Per-account counts for the transaction filters: the same filters as
 * `GET /transactions` (minus pagination, sort and the account filter), so the
 * account picker only offers accounts that have rows in the view.
 *
 * The response is wrapped on purpose: a bare array would be mistaken for a
 * transaction list by the optimistic sweep in the web's
 * `useUpdateTransaction.mutation.ts`.
 */
export interface ITransactionAccountFacetsResponse {
    accounts: ITransactionAccountFacet[];
}
