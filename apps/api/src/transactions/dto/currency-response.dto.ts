import { ApiProperty } from "@nestjs/swagger";

export class CurrencyResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    code: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    symbol: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
