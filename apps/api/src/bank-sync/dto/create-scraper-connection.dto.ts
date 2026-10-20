import { IsString, IsNotEmpty, IsInt, Min, Max, IsObject, MinLength, MaxLength } from "class-validator";

export class CreateScraperConnectionDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(4)
    @MaxLength(64)
    pin: string;

    @IsString()
    @IsNotEmpty()
    companyId: string;

    @IsString()
    @IsNotEmpty()
    displayName: string;

    @IsObject()
    credentials: Record<string, string>;

    @IsInt()
    @Min(1)
    @Max(365)
    scrapeLookbackDays: number;
}
