export interface IBudgetResponse {
    id: string;
    name: string;
    amount: number;
    /**
     * Canonical category linkage for budget spend attribution.
     * Must always contain at least one category ID.
     * Multiple category links are allowed and expected.
     */
    categoryIds: string[];
    period: "daily" | "weekly" | "monthly" | "yearly";
    /**
     * Optional lifecycle start boundary.
     */
    startDate: Date | null;
    /**
     * Optional lifecycle end boundary (inclusive local date in user timezone).
     */
    endDate: Date | null;
    /**
     * Optional lifecycle soft-delete timestamp.
     */
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
