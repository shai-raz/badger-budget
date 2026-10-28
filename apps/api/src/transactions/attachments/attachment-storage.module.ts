import { Module } from "@nestjs/common";
import { AttachmentStorageService } from "./attachment-storage.service";

@Module({
    providers: [AttachmentStorageService],
    exports: [AttachmentStorageService],
})
export class AttachmentStorageModule {}
