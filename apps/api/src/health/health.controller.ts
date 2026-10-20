import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

const DB_PING_TIMEOUT_MS = 2000;

/** Public (no guard): liveness plus a database ping, for container and proxy health checks. */
@ApiTags("health")
@Controller("health")
export class HealthController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    @ApiOperation({ summary: "Liveness check with database ping" })
    @ApiResponse({ status: 200, description: "API is up and the database responds" })
    @ApiResponse({ status: 503, description: "Database is unreachable or did not respond in time" })
    async check() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                this.prisma.$queryRaw`SELECT 1`,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Database ping timed out")), DB_PING_TIMEOUT_MS);
                }),
            ]);
        } catch {
            throw new ServiceUnavailableException({ status: "error", database: "unreachable" });
        } finally {
            clearTimeout(timer);
        }
        return { status: "ok", database: "ok" };
    }
}
