import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength, ValidateBy, ValidateNested, ValidationOptions } from "class-validator";

/** Hosts of the browser push services. The API POSTs to the endpoint, so anything else would let a user reach internal hosts. */
const PUSH_SERVICE_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /\.push\.services\.mozilla\.com$/,
    /\.push\.apple\.com$/,
    /\.notify\.windows\.com$/,
    /\.wns\.windows\.com$/,
];

export function isPushServiceEndpoint(value: unknown): boolean {
    if (typeof value !== "string") return false;

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:" && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}

export function IsPushServiceEndpoint(validationOptions?: ValidationOptions): PropertyDecorator {
    return ValidateBy(
        {
            name: "isPushServiceEndpoint",
            validator: {
                validate: (value) => isPushServiceEndpoint(value),
                defaultMessage: () => "endpoint must be an https URL on a known browser push service",
            },
        },
        validationOptions,
    );
}

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
    @ApiProperty({ description: "Push service endpoint URL (https, on a known browser push service)" })
    @IsPushServiceEndpoint()
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
