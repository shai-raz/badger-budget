import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AVATAR_ICON_NAMES } from "@badger/shared-data";
import type { AvatarIconName } from "@badger/shared-data";

export class CreateCategoryDto {
    @ApiProperty({ example: "Gym Membership" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: "#4CAF50" })
    @IsString()
    @IsNotEmpty()
    color: string;

    @ApiPropertyOptional({
        enum: [...AVATAR_ICON_NAMES],
        nullable: true,
        example: "dumbbell",
        description: "Avatar icon from the shared registry. Omit to get a name-based default.",
    })
    @IsIn([...AVATAR_ICON_NAMES])
    @IsOptional()
    icon?: AvatarIconName | null;
}

export class UpdateCategoryDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    color?: string;

    @ApiPropertyOptional({
        enum: [...AVATAR_ICON_NAMES],
        nullable: true,
        description: "Avatar icon from the shared registry. Pass null to clear.",
    })
    @IsIn([...AVATAR_ICON_NAMES])
    @IsOptional()
    icon?: AvatarIconName | null;
}

export class DeleteCategoryDto {
    @ApiPropertyOptional({ description: "Target category to move data to. Omit to leave data uncategorized." })
    @IsOptional()
    @IsUUID()
    transferToCategoryId?: string;

    @ApiPropertyOptional({
        default: true,
        description: "When transferring, also re-point mapping rules (true) or delete them (false).",
    })
    @IsOptional()
    @IsBoolean()
    moveMappingRules?: boolean;
}
