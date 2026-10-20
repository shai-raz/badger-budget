import { ApiProperty } from "@nestjs/swagger";

export class SheetConnectionDto {
    @ApiProperty({ description: "Connection ID" })
    id: string;

    @ApiProperty({ description: "Spreadsheet ID" })
    spreadsheetId: string;

    @ApiProperty({ description: "Sheet name/tab" })
    sheetName: string;

    @ApiProperty({ type: Date, nullable: true, description: "Last sync timestamp", required: false })
    lastSyncedAt: Date | null;

    @ApiProperty({ description: "Whether connection is active" })
    isActive: boolean;

    @ApiProperty({ description: "Connection created timestamp" })
    createdAt: Date;
}
