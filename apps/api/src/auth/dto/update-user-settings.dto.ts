import { IsIn, ValidateIf } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { UNMATCHED_IMPORT_CATEGORY_MODES } from "@badger/shared-data";
import type { UnmatchedImportCategoryMode } from "@badger/shared-data";

export class UpdateUserSettingsDto {
    @ApiPropertyOptional({
        enum: [...UNMATCHED_IMPORT_CATEGORY_MODES],
        description: "How an import's unmatched category is resolved; omit to keep the current value",
    })
    // ValidateIf rather than IsOptional: an explicit null is rejected, only an absent key is skipped
    @ValidateIf((_, value) => value !== undefined)
    @IsIn([...UNMATCHED_IMPORT_CATEGORY_MODES])
    unmatchedImportCategory?: UnmatchedImportCategoryMode;
}
