import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BUNDLED_CHANGELOG_PATH, CHANGELOG_READER, ChangelogService, readChangelogFile } from "./changelog.service";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpdateCheckService } from "./update-check.service";

@Module({
    imports: [AuthModule],
    controllers: [SystemController],
    providers: [
        SystemService,
        UpdateCheckService,
        ChangelogService,
        { provide: CHANGELOG_READER, useValue: () => readChangelogFile(BUNDLED_CHANGELOG_PATH) },
    ],
})
export class SystemModule {}
