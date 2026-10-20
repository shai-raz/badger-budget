import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean } from "class-validator";

export class OAuthDecisionDto {
    @ApiProperty()
    // The global pipe uses implicit conversion, which would turn any string into `true`; validate the raw value.
    @Transform(({ obj, key }) => obj[key])
    @IsBoolean()
    approve!: boolean;
}
