/**
 * Client-side params for the paginated `GET /transactions` list and its
 * `GET /transactions/summary` aggregate.
 *
 * This is the shape the WEB CLIENT works with. The api-client is responsible
 * for serializing it to the wire format the API expects — in particular
 * {@link ITransactionListParams.categoryIds} is a plain string array here and
 * gets joined into the CSV the API's query DTO parses.
 */
export interface ITransactionListParams {
    /** 1-based page number. The client always sends this (default 1) so the API returns the paginated shape. */
    page?: number;
    /** Page size (API default 50, max 100). */
    limit?: number;
    /** Case-insensitive search across description, additionalDescription and category name. */
    search?: string;
    /** Filter by transaction type. */
    type?: "income" | "expense" | "transfer";
    /**
     * Category ids to filter by. Client-side array — the api-client serializes
     * it to a comma-joined CSV (`id1,id2`) for the wire.
     *
     * The sentinel string `"uncategorized"` matches transactions with no
     * category. Omit the field entirely (or pass an empty array) to include all
     * categories.
     */
    categoryIds?: string[];
    /** Inclusive lower bound on transactionDate (YYYY-MM-DD). */
    startDate?: string;
    /** Inclusive upper bound on transactionDate (YYYY-MM-DD). */
    endDate?: string;
    /**
     * Only filters when explicitly `false` (hides hidden transactions). Absent
     * or `true` reveals hidden transactions (legacy behavior).
     */
    includeHidden?: boolean;
    /** Sort field (API default `transactionDate`). */
    sortBy?: "transactionDate" | "amount" | "description" | "createdAt";
    /** Sort direction (API default `desc`). */
    sortOrder?: "asc" | "desc";
    /** Legacy filter — filter by account id. */
    accountId?: string;
    /** Legacy filter — filter by a single category id. */
    categoryId?: string;
    /** Legacy filter — filter by budget id. */
    budgetId?: string;
}

/**
 * Params for the `GET /transactions/summary` aggregate: the same filters as the
 * list, minus pagination, sort and the hidden toggle — summaries always cover
 * all matching rows and always exclude hidden transactions.
 */
export type ITransactionSummaryParams = Omit<
    ITransactionListParams,
    "page" | "limit" | "sortBy" | "sortOrder" | "includeHidden"
>;
