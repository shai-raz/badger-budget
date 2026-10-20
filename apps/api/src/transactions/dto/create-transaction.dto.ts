import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsDateString,
    IsUUID,
    IsPositive,
    IsIn,
    IsBoolean,
    MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";

export class CreateTransactionDto {
    @ApiProperty({ example: "account-uuid" })
    @IsUUID()
    accountId: string;

    @ApiProperty({ enum: ["income", "expense", "transfer"], example: "expense" })
    @IsIn(["income", "expense", "transfer"])
    type: string;

    @ApiPropertyOptional({
        description: "Hidden transactions are excluded from the visible list and from Transferred/Available",
        default: false,
    })
    @IsBoolean()
    @IsOptional()
    hidden?: boolean;

    @ApiPropertyOptional({ enum: ["in", "out"], description: "Money direction for transfers; omit for income/expense" })
    @IsIn(["in", "out"])
    @IsOptional()
    transferDirection?: "in" | "out";

    @ApiProperty({ example: 42.5 })
    @IsNumber()
    @Type(() => Number)
    amount: number;

    @ApiProperty({ example: "currency-uuid" })
    @IsUUID()
    currencyId: string;

    @ApiProperty({ example: "Starbucks Coffee" })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ example: "2025-12-14" })
    @IsDateString()
    transactionDate: string;

    @ApiPropertyOptional({
        example: "Grande latte with oat milk",
        maxLength: TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH,
    })
    @IsString()
    @IsOptional()
    @MaxLength(TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH)
    additionalDescription?: string;

    @ApiPropertyOptional({
        example: "Split with Dana",
        maxLength: TRANSACTION_NOTES_MAX_LENGTH,
        description: "Free-form user notes",
    })
    @IsString()
    @IsOptional()
    @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
    notes?: string;

    @ApiPropertyOptional({ example: "Coffee & Restaurants" })
    @IsString()
    @IsOptional()
    originalCategory?: string;

    @ApiPropertyOptional({ example: "TXN-2025-12-14-001" })
    @IsString()
    @IsOptional()
    externalId?: string;

    @ApiPropertyOptional({ example: "2025-12-16" })
    @IsDateString()
    @IsOptional()
    postedDate?: string;

    @ApiPropertyOptional({ example: "budget-uuid" })
    @IsUUID()
    @IsOptional()
    budgetId?: string;

    @ApiPropertyOptional({ example: "category-uuid" })
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional({ description: "Cash account receiving/sending the money; transfers only" })
    @IsUUID()
    @IsOptional()
    counterpartAccountId?: string;

    @ApiPropertyOptional({ description: "Amount in the counterpart account's currency" })
    @IsNumber()
    @IsPositive()
    @Type(() => Number)
    @IsOptional()
    counterpartAmount?: number;
}
