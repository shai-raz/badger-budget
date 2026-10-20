import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCategoryDto {
    @ApiProperty({ example: "Gym Membership" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: "#4CAF50" })
    @IsString()
    @IsNotEmpty()
    color: string;

    @ApiPropertyOptional({ example: "dumbbell" })
    @IsString()
    @IsOptional()
    icon?: string;
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

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    icon?: string;
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
