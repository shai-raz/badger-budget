import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class UnregisterPushSubscriptionDto {
    @ApiProperty({ description: "Endpoint of the subscription to remove for the signed-in user" })
    @IsString()
    @MaxLength(2048)
    endpoint: string;
}
