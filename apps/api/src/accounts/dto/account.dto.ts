import { IsString, IsNotEmpty, IsOptional, IsIn, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ACCOUNT_TYPES } from "@badger/shared-data";
import type { AccountType } from "@badger/shared-data";

export class CreateAccountDto {
    @ApiProperty({ example: "My Visa Card" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({
        example: "1234",
        description: "Bank-assigned account identifier (e.g. last 4 digits). Read-only after creation.",
    })
    @IsString()
    @IsOptional()
    accountNumber?: string;

    @ApiProperty({
        enum: [...ACCOUNT_TYPES],
        example: "credit_card",
        description: "Account type. 'unknown' is reserved for system use only.",
    })
    @IsIn([...ACCOUNT_TYPES])
    type: AccountType;

    @ApiPropertyOptional({ example: "credit-card" })
    @IsString()
    @IsOptional()
    icon?: string;

    @ApiPropertyOptional({ example: "#FF5722" })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiPropertyOptional({
        description:
            "Currency ID for this account (the currency amounts are charged in). Required for cash and savings accounts, whose transactions must use it.",
    })
    @IsUUID()
    @IsOptional()
    currencyId?: string;
}

export class UpdateAccountDto {
    @ApiPropertyOptional({ example: "Updated Account Name" })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ enum: [...ACCOUNT_TYPES] })
    @IsIn([...ACCOUNT_TYPES])
    @IsOptional()
    type?: AccountType;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    icon?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    color?: string;

    @ApiPropertyOptional({
        description:
            "Currency ID for this account (the currency amounts are charged in). Required for cash and savings accounts, whose transactions must use it.",
    })
    @IsUUID()
    @IsOptional()
    currencyId?: string;
}
