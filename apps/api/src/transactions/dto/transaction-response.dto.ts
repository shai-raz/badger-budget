import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AccountResponseDto } from "./account-response.dto";
import { CurrencyResponseDto } from "./currency-response.dto";
import { CategoryResponseDto } from "./category-response.dto";
import { BudgetResponseDto } from "./budget-response.dto";
import { TransactionAttachmentResponseDto } from "./transaction-attachment-response.dto";
import type { ITransactionReimbursement, ITransactionResponse } from "@badger/types";
import type { AccountType } from "@badger/shared-data";
import { TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";

export class TransactionResponseDto implements ITransactionResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    userId: string;

    @ApiProperty()
    accountId: string;

    @ApiProperty({ enum: ["income", "expense", "transfer"] })
    type: "income" | "expense" | "transfer";

    @ApiProperty({
        description: "Hidden transactions are excluded from the visible list and from Transferred/Available",
    })
    hidden: boolean;

    @ApiProperty({
        type: String,
        nullable: true,
        enum: ["in", "out"],
        description: "Money direction for transfers; null for income/expense",
    })
    transferDirection: "in" | "out" | null;

    @ApiProperty()
    amount: number;

    @ApiProperty()
    currencyId: string;

    @ApiProperty({ type: Number, nullable: true })
    originalAmount: number | null;

    @ApiProperty({ type: String, nullable: true })
    originalCurrencyId: string | null;

    @ApiProperty()
    description: string;

    @ApiProperty()
    transactionDate: Date;

    @ApiProperty({ type: String, nullable: true })
    additionalDescription: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description: `User's free-form notes. Accepted on create/update (max ${TRANSACTION_NOTES_MAX_LENGTH} chars).`,
    })
    notes: string | null;

    @ApiProperty({ type: String, nullable: true })
    originalCategory: string | null;

    @ApiProperty({ type: String, nullable: true })
    externalId: string | null;

    @ApiProperty({ type: String, nullable: true, enum: ["normal", "installments"] })
    paymentType: string | null;

    @ApiProperty({ type: Date, nullable: true })
    postedDate: Date | null;

    @ApiProperty({ type: String, nullable: true })
    budgetId: string | null;

    @ApiProperty({ type: String, nullable: true })
    categoryId: string | null;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    @ApiProperty({ type: Date, nullable: true })
    deletedAt: Date | null;

    @ApiProperty({ type: AccountResponseDto })
    account: AccountResponseDto;

    @ApiProperty({ type: CurrencyResponseDto })
    currency: CurrencyResponseDto;

    @ApiProperty({ type: CurrencyResponseDto, nullable: true })
    originalCurrency: CurrencyResponseDto | null;

    @ApiProperty({ type: CategoryResponseDto, nullable: true })
    category: CategoryResponseDto | null;

    @ApiProperty({ type: BudgetResponseDto, nullable: true })
    budget: BudgetResponseDto | null;

    @ApiProperty({ description: "Live attachments on this transaction; the count is on every list row" })
    attachmentCount: number;

    @ApiPropertyOptional({
        type: [TransactionAttachmentResponseDto],
        description: "Only populated on the single-transaction detail endpoint",
    })
    attachments?: TransactionAttachmentResponseDto[];

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: "Set only on the mirror row of a linked transfer",
    })
    counterpartOfId: string | null;

    @ApiPropertyOptional({ nullable: true, description: "On a source transfer: the linked mirror row" })
    counterpart: {
        id: string;
        accountId: string;
        accountName: string;
        accountType: AccountType;
        amount: number;
        currencyId: string;
    } | null;

    @ApiPropertyOptional({ nullable: true, description: "On a mirror row: the source transfer" })
    counterpartOf: { id: string; description: string; accountId: string; accountName: string } | null;

    @ApiProperty({
        type: Object,
        nullable: true,
        description:
            "Reimbursement summary for an expense or income with live allocations (role, allocatedTotal, allocatedActive, links). Null for transfers and unlinked rows.",
    })
    reimbursement: ITransactionReimbursement | null;

    @ApiProperty({
        type: [BudgetResponseDto],
        required: false,
        description:
            "Budgets this transaction counts toward, derived from the transaction's category via budget-category links (plus the directly linked budget, if any). Empty for hidden transactions, which don't count toward spend. Only populated on the single-transaction detail endpoint.",
    })
    applicableBudgets?: BudgetResponseDto[];
}
