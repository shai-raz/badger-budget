import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { IsPushServiceEndpoint, PushSubscriptionKeysDto } from "../../notifications/dto/register-push-subscription.dto";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class MoveAutoSyncDeviceDto {
    @ApiProperty({ description: "Auto-sync grant ID" })
    @IsUUID()
    grantId: string;

    @ApiProperty({ description: "Device-held key, 32 bytes (base64url)", minLength: 43, maxLength: 43 })
    @IsString()
    @Matches(BASE64URL)
    @Length(43, 43)
    key: string;

    @ApiProperty({ description: "The browser's current push endpoint (https, on a known browser push service)" })
    @IsPushServiceEndpoint()
    @MaxLength(2048)
    endpoint: string;

    @ApiProperty({ type: PushSubscriptionKeysDto })
    @ValidateNested()
    @Type(() => PushSubscriptionKeysDto)
    keys: PushSubscriptionKeysDto;
}
