import { Exclude, Expose } from "class-transformer";

@Exclude()
export class CardPayoffPatternResponseDto {
    @Expose()
    id: string;

    @Expose()
    userId: string | null;

    @Expose()
    description: string;

    @Expose()
    isSystem: boolean;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}
