// Reimbursements: an income row pays back part of an expense row (see reimbursement_allocations).

export interface ITransactionReimbursementLink {
    allocationId: string;
    /** The OTHER side of the link. */
    transactionId: string;
    description: string;
    /** Other side's full amount. */
    transactionAmount: number;
    /** Other side's amount minus ALL of its allocations, clamped at 0. */
    transactionRemaining: number;
    transactionDate: Date;
    /** This allocation's amount. */
    amount: number;
    /** Other side not hidden/deleted AND this row not hidden. */
    active: boolean;
}

export interface ITransactionReimbursement {
    role: "expense" | "income";
    /** All links (caps / remaining / disable state). */
    allocatedTotal: number;
    /** Active links only (net / remainder / muted display); 0 if this row is hidden. */
    allocatedActive: number;
    links: ITransactionReimbursementLink[];
}

export interface ICreateReimbursementAllocation {
    incomeId: string;
    expenseId: string;
    amount: number;
}

export interface IUpdateReimbursementAllocation {
    amount: number;
}

export interface IReimbursementAllocationResponse {
    id: string;
    incomeId: string;
    expenseId: string;
    amount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IReimbursementCandidate {
    id: string;
    type: "income" | "expense";
    description: string;
    additionalDescription: string | null;
    amount: number;
    remaining: number;
    transactionDate: Date;
    currencyCode: string;
    category: { id: string; name: string; color: string | null; icon: string | null } | null;
}

export interface IReimbursementCandidatesResponse {
    source: {
        id: string;
        type: "income" | "expense";
        description: string;
        amount: number;
        remaining: number;
        currencyCode: string;
    };
    suggested: IReimbursementCandidate[];
    other: IReimbursementCandidate[];
}

export interface ICardPayoffLinkPreview {
    linkedTransactions: number;
    links: number;
}
