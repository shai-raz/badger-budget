import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
    RULE_ACTION_TYPES,
    RULE_APPLY_MODES,
    RULE_CONDITION_FIELDS,
    RULE_CONDITION_VALUE_MAX_LENGTH,
    RULE_NAME_MAX_LENGTH,
    RULE_OPERATORS,
} from "@badger/shared-data";
import type { RuleActionType, RuleApplyMode, RuleConditionField, RuleOperator } from "@badger/shared-data";

export class RuleConditionDto {
    @ApiProperty({ enum: [...RULE_CONDITION_FIELDS], example: "description" })
    @IsIn([...RULE_CONDITION_FIELDS])
    field: RuleConditionField;

    @ApiProperty({ enum: [...RULE_OPERATORS], example: "contains" })
    @IsIn([...RULE_OPERATORS])
    operator: RuleOperator;

    @ApiProperty({ example: "starbucks" })
    @IsString()
    @MaxLength(RULE_CONDITION_VALUE_MAX_LENGTH)
    value: string;
}

export class RuleActionDto {
    @ApiProperty({ enum: [...RULE_ACTION_TYPES], example: "set_category" })
    @IsIn([...RULE_ACTION_TYPES])
    type: RuleActionType;

    @ApiProperty({ description: "For set_category, the category ID.", example: "category-uuid" })
    @IsString()
    @IsNotEmpty()
    value: string;
}

/** Which previewed transactions a save-and-apply touches: all except the ids, or only the ids. */
export class ApplyRuleSelectionDto {
    @ApiProperty({ enum: [...RULE_APPLY_MODES] })
    @IsIn([...RULE_APPLY_MODES])
    mode: RuleApplyMode;

    @ApiProperty({ type: [String] })
    @IsArray()
    @ArrayMaxSize(20000)
    @IsUUID("all", { each: true })
    ids: string[];
}

export class CreateRuleDto {
    @ApiProperty({ example: "Coffee shops" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(RULE_NAME_MAX_LENGTH)
    name: string;

    @ApiProperty({ type: [RuleConditionDto], description: "Every condition must match (AND)." })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RuleConditionDto)
    conditions: RuleConditionDto[];

    @ApiProperty({ type: [RuleActionDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RuleActionDto)
    actions: RuleActionDto[];

    @ApiPropertyOptional({ default: false })
    @IsBoolean()
    @IsOptional()
    stopOnMatch?: boolean;

    @ApiPropertyOptional({ type: ApplyRuleSelectionDto })
    @ValidateNested()
    @Type(() => ApplyRuleSelectionDto)
    @IsOptional()
    apply?: ApplyRuleSelectionDto;
}

export class UpdateRuleDto {
    @ApiProperty({ example: "Coffee shops" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(RULE_NAME_MAX_LENGTH)
    name: string;

    @ApiProperty({ type: [RuleConditionDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RuleConditionDto)
    conditions: RuleConditionDto[];

    @ApiProperty({ type: [RuleActionDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => RuleActionDto)
    actions: RuleActionDto[];

    @ApiProperty()
    @IsBoolean()
    stopOnMatch: boolean;

    @ApiPropertyOptional({ type: ApplyRuleSelectionDto })
    @ValidateNested()
    @Type(() => ApplyRuleSelectionDto)
    @IsOptional()
    apply?: ApplyRuleSelectionDto;
}

export class SetRuleActiveDto {
    @ApiProperty()
    @IsBoolean()
    isActive: boolean;
}

export class ReorderRulesDto {
    @ApiProperty({ type: [String], description: "Every non-deleted rule ID, in the new order." })
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID("all", { each: true })
    ids: string[];
}
