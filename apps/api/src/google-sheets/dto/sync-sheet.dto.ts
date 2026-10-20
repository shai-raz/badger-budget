import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class SyncSheetDto {
    @ApiPropertyOptional({
        description:
            "ISO 4217 currency code derived from the client's locale (e.g. 'ILS', 'USD'). Used as a fallback when creating new accounts.",
        example: "ILS",
    })
    @IsString()
    @IsOptional()
    @Length(3, 3)
    defaultCurrencyCode?: string;
}
