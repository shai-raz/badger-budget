import { IsString, IsNotEmpty, IsOptional, IsIn, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
        enum: ["credit_card", "bank", "cash", "unknown"],
        example: "credit_card",
        description: "Account type. 'unknown' is reserved for system use only.",
    })
    @IsIn(["credit_card", "bank", "cash", "unknown"])
    type: string;

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
            "Currency ID for this account (the currency amounts are charged in). Required for cash accounts, whose transactions must use it.",
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

    @ApiPropertyOptional({ enum: ["credit_card", "bank", "cash", "unknown"] })
    @IsIn(["credit_card", "bank", "cash", "unknown"])
    @IsOptional()
    type?: string;

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
            "Currency ID for this account (the currency amounts are charged in). Required for cash accounts, whose transactions must use it.",
    })
    @IsUUID()
    @IsOptional()
    currencyId?: string;
}
