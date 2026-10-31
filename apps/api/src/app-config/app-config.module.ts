import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentStorageModule } from "../transactions/attachments/attachment-storage.module";
import { AppConfigController } from "./app-config.controller";

@Module({
    imports: [AuthModule, AttachmentStorageModule],
    controllers: [AppConfigController],
})
export class AppConfigModule {}
