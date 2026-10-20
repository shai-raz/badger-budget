import { IsString, MinLength, MaxLength, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TriggerSyncDto {
    @ApiProperty({ description: "Sync PIN to verify identity and decrypt credentials", minLength: 4, maxLength: 64 })
    @IsString()
    @MinLength(4)
    @MaxLength(64)
    pin: string;

    @ApiPropertyOptional({ description: "ISO 4217 currency code hint for new account creation" })
    @IsOptional()
    @IsString()
    defaultCurrencyCode?: string;
}
