import { ApiProperty } from "@nestjs/swagger";

export class CategoryResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    color: string;

    @ApiProperty({ type: String, nullable: true })
    icon: string | null;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
