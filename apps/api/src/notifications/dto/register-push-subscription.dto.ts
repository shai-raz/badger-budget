import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from "class-validator";

export class PushSubscriptionKeysDto {
    @ApiProperty({ description: "Client public key (base64url)" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    p256dh: string;

    @ApiProperty({ description: "Client auth secret (base64url)" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    auth: string;
}

export class RegisterPushSubscriptionDto {
    @ApiProperty({ description: "Push service endpoint URL (https)" })
    @IsUrl({ protocols: ["https"], require_protocol: true, require_tld: false })
    @MaxLength(2048)
    endpoint: string;

    @ApiProperty({ type: PushSubscriptionKeysDto })
    @ValidateNested()
    @Type(() => PushSubscriptionKeysDto)
    keys: PushSubscriptionKeysDto;

    @ApiProperty({ description: "Human-readable device name shown in settings" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    deviceLabel: string;
}
