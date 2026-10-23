import { ApiProperty } from "@nestjs/swagger";
import type { IReimbursementAllocationResponse } from "@badger/types";

export class ReimbursementAllocationResponseDto implements IReimbursementAllocationResponse {
    @ApiProperty({ format: "uuid" })
    id: string;

    @ApiProperty({ format: "uuid" })
    incomeId: string;

    @ApiProperty({ format: "uuid" })
    expenseId: string;

    @ApiProperty({ type: Number })
    amount: number;

    @ApiProperty({ type: Date })
    createdAt: Date;

    @ApiProperty({ type: Date })
    updatedAt: Date;
}
