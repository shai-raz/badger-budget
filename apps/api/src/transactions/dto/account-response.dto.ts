import type { IAccountResponse } from "@badger/types";
import type { AccountType, BalanceKind } from "@badger/shared-data";
import { ACCOUNT_TYPES } from "@badger/shared-data";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CurrencyResponseDto } from "./currency-response.dto";

export class AccountResponseDto implements IAccountResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiPropertyOptional({ type: String, nullable: true })
    accountNumber: string | null;

    @ApiProperty({ enum: [...ACCOUNT_TYPES] })
    type: AccountType;

    @ApiProperty({ type: String, nullable: true })
    icon: string | null;

    @ApiProperty({ type: String, nullable: true })
    color: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    currencyId: string | null;

    @ApiPropertyOptional({ type: CurrencyResponseDto, nullable: true })
    currency: CurrencyResponseDto | null;

    @ApiPropertyOptional({ type: Number, nullable: true })
    balance: number | null;

    @ApiPropertyOptional({
        enum: ["account_balance", "next_charge", "utilized_credit", "cash_on_hand"],
        nullable: true,
    })
    balanceKind: BalanceKind | null;

    @ApiPropertyOptional({ type: Date, nullable: true })
    balanceDate: Date | null;

    @ApiPropertyOptional({ type: Date, nullable: true })
    balanceUpdatedAt: Date | null;

    @ApiPropertyOptional({ type: Number, nullable: true })
    cardFrame: number | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    cardIssuer: string | null;

    @ApiProperty()
    hasLinkedTransfers: boolean;

    @ApiProperty()
    hasTransactions: boolean;

    @ApiPropertyOptional({ type: Date, nullable: true })
    lastTransactionDate: Date | null;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
