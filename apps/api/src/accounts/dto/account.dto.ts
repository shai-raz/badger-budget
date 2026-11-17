import { IsString, IsNotEmpty, IsOptional, IsIn, IsUUID, IsBoolean, ValidateIf } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ACCOUNT_TYPES, AVATAR_ICON_NAMES } from "@badger/shared-data";
import type { AccountType, AvatarIconName } from "@badger/shared-data";
import type { IUpdateAccount } from "@badger/types";

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

    @ApiPropertyOptional({
        enum: [...AVATAR_ICON_NAMES],
        nullable: true,
        example: "credit-card",
        description: "Avatar icon from the shared registry.",
    })
    @IsIn([...AVATAR_ICON_NAMES])
    @IsOptional()
    icon?: AvatarIconName | null;

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

export class UpdateAccountDto implements IUpdateAccount {
    @ApiPropertyOptional({ example: "Updated Account Name" })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ enum: [...ACCOUNT_TYPES] })
    @IsIn([...ACCOUNT_TYPES])
    @IsOptional()
    type?: AccountType;

    @ApiPropertyOptional({
        enum: [...AVATAR_ICON_NAMES],
        nullable: true,
        description: "Avatar icon from the shared registry. Pass null to clear.",
    })
    @IsIn([...AVATAR_ICON_NAMES])
    @IsOptional()
    icon?: AvatarIconName | null;

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

    @ApiPropertyOptional({ description: "Hide the account's card from Overview's Accounts section. Display only." })
    // The global pipe uses implicit conversion, which would turn any string into `true`; validate the raw value.
    @Transform(({ obj, key }) => obj[key])
    // ValidateIf rather than IsOptional: IsOptional would let an explicit null through to a non-nullable column.
    @ValidateIf((_, value) => value !== undefined)
    @IsBoolean()
    hiddenOnOverview?: boolean;
}
