import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AUTO_SYNC_INTERVAL_UNITS, AUTO_SYNC_MAX_MINUTE, type AutoSyncIntervalUnit } from "@badger/shared-data";

/** Unit-specific rules (count range, window vs run time) are enforced by parseAutoSyncSchedule. */
export class AutoSyncScheduleDto {
    @ApiProperty({ enum: AUTO_SYNC_INTERVAL_UNITS, description: "Repeat every N hours or every N days" })
    @IsIn(AUTO_SYNC_INTERVAL_UNITS)
    intervalUnit: AutoSyncIntervalUnit;

    @ApiProperty({ description: "How many hours or days between runs", minimum: 1, maximum: 23 })
    @IsInt()
    @Min(1)
    @Max(23)
    intervalCount: number;

    @ApiPropertyOptional({ description: "Hours only: window start, minutes after local midnight", nullable: true })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(AUTO_SYNC_MAX_MINUTE)
    windowStartMinute?: number | null;

    @ApiPropertyOptional({ description: "Hours only: window end, minutes after local midnight", nullable: true })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(AUTO_SYNC_MAX_MINUTE)
    windowEndMinute?: number | null;

    @ApiPropertyOptional({ description: "Days only: local run time, minutes after local midnight", nullable: true })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(AUTO_SYNC_MAX_MINUTE)
    runAtMinute?: number | null;

    @ApiProperty({ description: "IANA time zone the schedule is read in", maxLength: 64 })
    @IsString()
    @MaxLength(64)
    timeZone: string;
}
