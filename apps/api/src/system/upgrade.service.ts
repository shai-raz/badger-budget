import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ISystemUpgradeResponse } from "@badger/types";
import { DEPLOY_WEBHOOK_TIMEOUT_MS, DeployWebhookConfig, parseDeployWebhookConfig } from "./deploy-webhook-config";
import { UpdateCheckService } from "./update-check.service";

type FetchFailureKind = "timeout" | "invalid-request" | "network";

/** Logs only the kind of failure. err.message and err.cause can contain the webhook URL. */
function classifyFetchError(error: unknown): FetchFailureKind {
    if ((error as { name?: unknown } | null)?.name === "TimeoutError") return "timeout";
    if (error instanceof TypeError && (error as { cause?: unknown }).cause === undefined) return "invalid-request";
    return "network";
}

/**
 * Triggers the host's deploy webhook so an admin can upgrade the instance from the app. Serialised by an in-memory
 * lock: one call in flight at a time, and no new call for LOCK_MS after a success. The response body is never read
 * and no URL, token or body value is ever logged or returned.
 */
@Injectable()
export class UpgradeService {
    static readonly LOCK_MS = 2 * 60_000;

    private readonly logger = new Logger(UpgradeService.name);
    private readonly webhook: DeployWebhookConfig | null;
    private inFlight = false;
    private lastSuccessAt: number | null = null;

    constructor(
        config: ConfigService,
        private readonly updateCheck: UpdateCheckService,
    ) {
        const result = parseDeployWebhookConfig({
            DEPLOY_WEBHOOK_URL: config.get<string>("DEPLOY_WEBHOOK_URL"),
            DEPLOY_WEBHOOK_TOKEN: config.get<string>("DEPLOY_WEBHOOK_TOKEN"),
            DEPLOY_WEBHOOK_TOKEN_HEADER: config.get<string>("DEPLOY_WEBHOOK_TOKEN_HEADER"),
            DEPLOY_WEBHOOK_BODY: config.get<string>("DEPLOY_WEBHOOK_BODY"),
        });
        for (const warning of result.warnings) this.logger.warn(warning);
        this.webhook = result.config;
    }

    isConfigured(): boolean {
        return this.webhook !== null;
    }

    async trigger(userId: string): Promise<ISystemUpgradeResponse> {
        const webhook = this.webhook;
        if (webhook === null) throw new NotFoundException("In-app upgrade is not configured on this instance");
        if (
            this.inFlight ||
            (this.lastSuccessAt !== null && Date.now() - this.lastSuccessAt < UpgradeService.LOCK_MS)
        ) {
            throw new ConflictException("An upgrade is already in progress");
        }

        this.inFlight = true;
        const started = Date.now();
        try {
            let response: Response;
            try {
                response = await fetch(webhook.url, {
                    method: "POST",
                    headers: webhook.headers,
                    body: webhook.body,
                    redirect: "manual",
                    signal: AbortSignal.timeout(DEPLOY_WEBHOOK_TIMEOUT_MS),
                });
            } catch (error) {
                const kind = classifyFetchError(error);
                this.logger.warn(
                    `Deploy webhook call by user ${userId} failed (${kind}) after ${Date.now() - started}ms`,
                );
                throw new BadGatewayException("Could not reach the deploy webhook");
            }

            // The body is not needed and may be large or echo the request; release the connection without reading it.
            await response.body?.cancel().catch(() => undefined);

            const duration = Date.now() - started;
            // Status 0 is what a manual redirect can surface as; any non-2xx counts as a rejection.
            if (response.status < 200 || response.status > 299) {
                this.logger.warn(
                    `Deploy webhook rejected for user ${userId}: HTTP ${response.status} in ${duration}ms`,
                );
                throw new BadGatewayException(
                    `The host rejected the deploy request (HTTP ${response.status || "redirect"})`,
                );
            }

            this.lastSuccessAt = Date.now();
            this.logger.log(`Deploy webhook triggered by user ${userId}: HTTP ${response.status} in ${duration}ms`);
            const { latest } = await this.updateCheck.getLatest();
            return { targetVersion: latest?.version ?? null };
        } finally {
            this.inFlight = false;
        }
    }
}
