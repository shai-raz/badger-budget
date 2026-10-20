import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AppConfigController } from "./app-config.controller";

@Module({
    imports: [AuthModule],
    controllers: [AppConfigController],
})
export class AppConfigModule {}
