import { ApiProperty } from "@nestjs/swagger";

export class SyncResultDto {
    @ApiProperty({ description: "Whether the sync was successful" })
    success: boolean;

    @ApiProperty({ description: "Number of transactions synced" })
    transactionsSynced: number;

    @ApiProperty({ description: "Number of new categories created" })
    categoriesCreated: number;

    @ApiProperty({ description: "Number of new accounts created" })
    accountsCreated: number;

    @ApiProperty({ description: "Number of rows skipped due to errors" })
    rowsSkipped: number;

    @ApiProperty({ description: "List of warnings during sync", type: [String] })
    warnings: string[];

    @ApiProperty({ description: "Error message if sync failed", required: false })
    error?: string;

    @ApiProperty({ description: "Timestamp of sync completion" })
    syncedAt: Date;
}
