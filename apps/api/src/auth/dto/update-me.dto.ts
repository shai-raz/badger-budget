import { IsIn, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { COLOR_THEMES } from "@badger/shared-data";
import type { ColorThemeName } from "@badger/shared-data";

export class UpdateMeDto {
    @ApiPropertyOptional({
        enum: [...COLOR_THEMES],
        nullable: true,
        description: "Colour theme; null resets to the default",
    })
    @IsIn([...COLOR_THEMES])
    @IsOptional()
    colorTheme?: ColorThemeName | null;
}
