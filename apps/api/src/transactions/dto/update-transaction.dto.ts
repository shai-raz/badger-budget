import {
    IsString,
    IsOptional,
    IsNumber,
    IsPositive,
    IsDateString,
    IsUUID,
    IsIn,
    IsBoolean,
    MaxLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";

export class UpdateTransactionDto {
    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    accountId?: string;

    @ApiPropertyOptional({ enum: ["income", "expense", "transfer"] })
    @IsIn(["income", "expense", "transfer"])
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: "Hidden transactions are excluded from the visible list and from Transferred/Available",
    })
    @IsBoolean()
    @IsOptional()
    hidden?: boolean;

    @ApiPropertyOptional({
        enum: ["in", "out"],
        description:
            "Money direction for transfers; defaults from the previous type when a transaction becomes a transfer",
    })
    @IsIn(["in", "out"])
    @IsOptional()
    transferDirection?: "in" | "out";

    @ApiPropertyOptional()
    @IsNumber()
    @Type(() => Number)
    @IsOptional()
    amount?: number;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    currencyId?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional()
    @IsDateString()
    @IsOptional()
    transactionDate?: string;

    @ApiPropertyOptional({ maxLength: TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH })
    @IsString()
    @IsOptional()
    @MaxLength(TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH)
    additionalDescription?: string;

    @ApiPropertyOptional({ maxLength: TRANSACTION_NOTES_MAX_LENGTH, description: "Free-form user notes" })
    @IsString()
    @IsOptional()
    @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
    notes?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    originalCategory?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    externalId?: string;

    @ApiPropertyOptional()
    @IsDateString()
    @IsOptional()
    postedDate?: string;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    budgetId?: string;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: "Cash account for the linked mirror row; transfers only. null removes the counterpart",
    })
    @IsUUID()
    @IsOptional()
    counterpartAccountId?: string | null;

    @ApiPropertyOptional({ description: "Amount in the counterpart account's currency" })
    @IsNumber()
    @IsPositive()
    @Type(() => Number)
    @IsOptional()
    counterpartAmount?: number;
}
