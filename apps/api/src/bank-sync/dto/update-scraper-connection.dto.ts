import {
    IsString,
    IsOptional,
    IsInt,
    Min,
    Max,
    IsObject,
    IsNotEmpty,
    MinLength,
    MaxLength,
    IsBoolean,
} from "class-validator";

export class UpdateScraperConnectionDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    displayName?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(365)
    scrapeLookbackDays?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    // To re-encrypt credentials, both pin and credentials must be provided together
    @IsOptional()
    @IsString()
    @MinLength(4)
    @MaxLength(64)
    pin?: string;

    @IsOptional()
    @IsObject()
    credentials?: Record<string, string>;
}
