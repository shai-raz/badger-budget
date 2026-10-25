import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { IReimbursementCandidate, IReimbursementCandidatesResponse } from "@badger/types";

class ReimbursementCandidateCategoryDto {
    @ApiProperty({ format: "uuid" })
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ example: "#4CAF50" })
    color: string;

    @ApiPropertyOptional({ nullable: true })
    icon: string | null;
}

export class ReimbursementCandidateDto implements IReimbursementCandidate {
    @ApiProperty({ format: "uuid" })
    id: string;

    @ApiProperty({ enum: ["income", "expense"] })
    type: "income" | "expense";

    @ApiProperty()
    description: string;

    @ApiPropertyOptional({ nullable: true })
    additionalDescription: string | null;

    @ApiProperty({ type: Number })
    amount: number;

    @ApiProperty({ type: Number, description: "Amount minus all existing allocations, clamped at 0" })
    remaining: number;

    @ApiProperty({ type: Date })
    transactionDate: Date;

    @ApiProperty({ example: "ILS" })
    currencyCode: string;

    @ApiPropertyOptional({ type: ReimbursementCandidateCategoryDto, nullable: true })
    category: ReimbursementCandidateCategoryDto | null;
}

export class ReimbursementCandidatesResponseDto implements IReimbursementCandidatesResponse {
    @ApiProperty({
        description: "The transaction the picker was opened for",
        type: "object",
        properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["income", "expense"] },
            description: { type: "string" },
            amount: { type: "number" },
            remaining: { type: "number" },
            currencyCode: { type: "string" },
        },
    })
    source: IReimbursementCandidatesResponse["source"];

    @ApiProperty({ type: [ReimbursementCandidateDto], description: "Candidates matching a suggestion source" })
    suggested: ReimbursementCandidateDto[];

    @ApiProperty({ type: [ReimbursementCandidateDto], description: "All other candidates" })
    other: ReimbursementCandidateDto[];
}
