import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { IAppConfigResponse } from "@badger/types";
import { RegistrationPolicyService } from "../auth/registration-policy.service";
import { AttachmentStorageService } from "../transactions/attachments/attachment-storage.service";

/** Public (no guard): feature flags the web app reads before sign-in. Exposes no secret values. */
@ApiTags("config")
@Controller("config")
export class AppConfigController {
    constructor(
        private readonly config: ConfigService,
        private readonly registrationPolicy: RegistrationPolicyService,
        private readonly attachmentStorage: AttachmentStorageService,
    ) {}

    @Get()
    @ApiOperation({ summary: "Public instance configuration (feature flags)" })
    @ApiResponse({
        status: 200,
        description: "registrationOpen, googleSheetsEnabled, fxEnabled and attachmentsEnabled flags",
    })
    async getConfig(): Promise<IAppConfigResponse> {
        return {
            registrationOpen: await this.registrationPolicy.isRegistrationOpen(),
            googleSheetsEnabled: this.isSet("GOOGLE_SHEETS_CLIENT_EMAIL") && this.isSet("GOOGLE_SHEETS_PRIVATE_KEY"),
            fxEnabled: this.isSet("FREE_CURRENCY_API_KEY"),
            attachmentsEnabled: this.attachmentStorage.enabled,
        };
    }

    /** Whitespace-only values count as unset. */
    private isSet(key: string): boolean {
        return !!this.config.get<string>(key)?.trim();
    }
}
