import { IsString, MinLength, MaxLength } from "class-validator";

export class SetSyncPinDto {
    @IsString()
    @MinLength(4)
    @MaxLength(64)
    pin: string;
}
