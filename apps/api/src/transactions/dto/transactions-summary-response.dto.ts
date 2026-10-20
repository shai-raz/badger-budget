import { ApiProperty } from "@nestjs/swagger";
import type { ITransactionsSummaryResponse } from "@badger/types";

/**
 * Aggregate totals returned by `GET /transactions/summary`, reflecting the
 * active filters (search, type, categoryIds, date range).
 *
 * Hidden transactions are ALWAYS excluded from these totals, regardless of the
 * list's "show hidden" toggle.
 *
 * IMPORTANT: all amounts are naive sums over the transaction-currency `amount`
 * with NO FX conversion — a mixed-currency selection is summed as-is (matching
 * the web client's existing `Total.vue`). `currencyCode` is a best-effort
 * display hint (the most recent matching transaction's currency), not a
 * conversion target. Cross-currency conversion belongs to the reports module.
 */
export class TransactionsSummaryResponseDto implements ITransactionsSummaryResponse {
    @ApiProperty({ description: "Sum of amount over income transactions." })
    income: number;

    @ApiProperty({ description: "Sum of amount over expense transactions." })
    expenses: number;

    @ApiProperty({ description: "income − expenses." })
    net: number;

    @ApiProperty({
        description:
            "Sum over transfer transactions of (transferDirection === 'in' ? -1 : +1) × amount; a null/absent direction counts as 'out' (+1).",
    })
    transferred: number;

    @ApiProperty({ description: "net − transferred." })
    available: number;

    @ApiProperty({ description: "Number of (non-hidden) transactions matching the filters." })
    count: number;

    @ApiProperty({
        description:
            "Currency code of the most recent matching transaction (display hint only — totals are NOT converted). Falls back to 'ILS' when there are no matching transactions.",
        example: "ILS",
    })
    currencyCode: string;
}
