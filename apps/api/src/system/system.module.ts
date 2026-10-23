import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpdateCheckService } from "./update-check.service";

@Module({
    imports: [AuthModule],
    controllers: [SystemController],
    providers: [SystemService, UpdateCheckService],
})
export class SystemModule {}
