import { IsNumber, IsPositive } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class UpdateReimbursementAllocationDto {
    @ApiProperty({ example: 150, description: "New amount for this allocation, 2 decimal places max" })
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Type(() => Number)
    amount: number;
}
