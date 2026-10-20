import type { IBudgetResponse } from "@badger/types";
import { ApiProperty } from "@nestjs/swagger";

export class BudgetResponseDto implements IBudgetResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    amount: number;

    @ApiProperty({
        type: [String],
        description:
            "Canonical category linkage for the budget. Multiple categories are supported and expected for overlap scenarios.",
        minItems: 1,
    })
    categoryIds: string[];

    @ApiProperty({ enum: ["daily", "weekly", "monthly", "yearly"] })
    period: "daily" | "weekly" | "monthly" | "yearly";

    @ApiProperty({
        type: Date,
        nullable: true,
        description: "Optional lifecycle start boundary.",
    })
    startDate: Date | null;

    @ApiProperty({
        type: Date,
        nullable: true,
        description: "Optional lifecycle end boundary (inclusive local date).",
    })
    endDate: Date | null;

    @ApiProperty({
        type: Date,
        nullable: true,
        description: "Optional lifecycle soft-delete timestamp.",
    })
    deletedAt: Date | null;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
