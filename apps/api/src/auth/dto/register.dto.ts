import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterDto {
    @ApiProperty({ example: "john.doe@example.com" })
    @IsEmail()
    email: string;

    @ApiProperty({ example: "SecurePass123!", minLength: 8 })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: "John" })
    @IsString()
    firstName: string;

    @ApiProperty({ example: "Doe" })
    @IsString()
    lastName: string;
}
