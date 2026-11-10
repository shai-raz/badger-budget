import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, ValidateNested } from "class-validator";
import { NOTIFICATION_TYPES, type NotificationType } from "@badger/shared-data";

export class NotificationPreferenceUpdateDto {
    @ApiProperty({ enum: NOTIFICATION_TYPES, description: "Notification type to change" })
    @IsIn([...NOTIFICATION_TYPES])
    type: NotificationType;

    @ApiProperty({ description: "Whether this notification type is delivered to the user" })
    @IsBoolean()
    enabled: boolean;
}

export class UpdateNotificationPreferencesDto {
    @ApiProperty({
        type: [NotificationPreferenceUpdateDto],
        description: "Changed types; any invalid entry rejects all",
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(NOTIFICATION_TYPES.length)
    @ValidateNested({ each: true })
    @Type(() => NotificationPreferenceUpdateDto)
    preferences: NotificationPreferenceUpdateDto[];
}
