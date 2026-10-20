import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ConnectSheetDto {
    @ApiProperty({
        description: "Google Sheets spreadsheet ID (from the URL)",
        example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    })
    @IsString()
    @IsNotEmpty()
    spreadsheetId: string;

    @ApiProperty({
        description: "Name of the sheet tab to sync (default: Sheet1)",
        example: "Sheet1",
        required: false,
        default: "Sheet1",
    })
    @IsString()
    @IsOptional()
    sheetName?: string;
}
