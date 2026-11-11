import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";
import { AUTO_SYNC_DURATIONS, type AutoSyncDurationDays } from "@badger/shared-data";
import { AutoSyncScheduleDto } from "./auto-sync-schedule.dto";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class EnableAutoSyncDto extends AutoSyncScheduleDto {
    @ApiProperty({ description: "Sync PIN, verified before anything is stored", minLength: 4, maxLength: 64 })
    @IsString()
    @MinLength(4)
    @MaxLength(64)
    pin: string;

    @ApiProperty({ description: "Device-held key, 32 bytes (base64url)", minLength: 43, maxLength: 43 })
    @IsString()
    @Matches(BASE64URL)
    @Length(43, 43)
    key: string;

    @ApiProperty({ description: "Label shown for this device", minLength: 1, maxLength: 100 })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    deviceLabel: string;

    @ApiPropertyOptional({ enum: AUTO_SYNC_DURATIONS, description: "Days auto-sync stays on" })
    @IsOptional()
    @IsIn(AUTO_SYNC_DURATIONS)
    durationDays?: AutoSyncDurationDays;
}
