import { IsString, MaxLength, IsNotEmpty } from "class-validator";

export class CreateCardPayoffPatternDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    description: string;
}
