import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

/** Query params for `GET /bank-sync/sync/jobs`. */
export class ListSyncJobsQueryDto {
    @ApiPropertyOptional({ description: "Page size (default 10)", minimum: 1, maximum: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;

    @ApiPropertyOptional({ description: "Id of the last job on the previous page" })
    @IsOptional()
    @IsUUID()
    cursor?: string;
}
