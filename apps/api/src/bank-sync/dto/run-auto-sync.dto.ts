import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, Length, Matches } from "class-validator";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class RunAutoSyncDto {
    @ApiProperty({ description: "Auto-sync grant ID" })
    @IsUUID()
    grantId: string;

    @ApiProperty({ description: "Device-held key, 32 bytes (base64url)", minLength: 43, maxLength: 43 })
    @IsString()
    @Matches(BASE64URL)
    @Length(43, 43)
    key: string;

    @ApiProperty({ description: "One-time run token, 32 bytes (base64url)", minLength: 43, maxLength: 43 })
    @IsString()
    @Matches(BASE64URL)
    @Length(43, 43)
    runToken: string;
}
