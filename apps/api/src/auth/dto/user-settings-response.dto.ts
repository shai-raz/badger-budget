import { ApiProperty } from "@nestjs/swagger";
import { UNMATCHED_IMPORT_CATEGORY_MODES } from "@badger/shared-data";
import type { UnmatchedImportCategoryMode } from "@badger/shared-data";
import type { IUserSettings } from "@badger/types";

export class UserSettingsResponseDto implements IUserSettings {
    @ApiProperty({ enum: [...UNMATCHED_IMPORT_CATEGORY_MODES] })
    unmatchedImportCategory: UnmatchedImportCategoryMode;
}
