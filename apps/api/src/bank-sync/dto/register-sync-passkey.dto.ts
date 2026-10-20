import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class RegisterSyncPasskeyDto {
    @ApiProperty({ description: "Current sync PIN, verified before the passkey is stored" })
    @IsString()
    @MinLength(4)
    @MaxLength(64)
    pin: string;

    @ApiProperty({ description: "WebAuthn credential ID (base64url)" })
    @IsString()
    @Matches(BASE64URL)
    @MaxLength(1400)
    credentialId: string;

    @ApiProperty({ description: "PRF salt, 32 bytes (base64url)" })
    @IsString()
    @Matches(BASE64URL)
    @Length(43, 43)
    prfSalt: string;

    @ApiProperty({ description: "PIN encrypted with the PRF-derived key (base64url)" })
    @IsString()
    @Matches(BASE64URL)
    @MaxLength(512)
    wrappedPinCt: string;

    @ApiProperty({ description: "AES-GCM IV, 12 bytes (base64url)" })
    @IsString()
    @Matches(BASE64URL)
    @Length(16, 16)
    wrappedPinIv: string;

    @ApiProperty({ description: "User-facing passkey label" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    label: string;
}
