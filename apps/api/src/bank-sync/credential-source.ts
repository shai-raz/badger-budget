import type { ScraperConnection } from "@prisma/client";
import type { SyncErrorCode } from "@badger/shared-data";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";

/** A sync run's aggregate status once every connection has settled. */
export type AggregateSyncStatus = "success" | "partial" | "failed";

/** What a finished run reports to its source: the aggregate status, imported transactions and each failed connection. */
export interface SyncJobSummary {
    jobId: string;
    status: AggregateSyncStatus;
    newTransactions: number;
    failedConnections: { id: string; displayName: string; code: SyncErrorCode }[];
}

/** Supplies a connection's plaintext credentials to a sync run, and hears about its failures and its result. */
export interface CredentialSource {
    /** Plaintext credentials for one connection. Any throw is recorded as CREDENTIALS_UNREADABLE. */
    resolve(connection: ScraperConnection): Record<string, string>;
    /** Called after a connection's scraper job is recorded as failed. Must not throw into the job. */
    onConnectionFailed?(connectionId: string, code: SyncErrorCode): Promise<void>;
    /** Called once the run's aggregate status and counts are stored. Must not throw into the job. */
    onFinished?(summary: SyncJobSummary): Promise<void>;
}

/** Decrypts each connection's stored credentials with the user's sync PIN. */
export function pinCredentialSource(crypto: CredentialCryptoService, pin: string): CredentialSource {
    return {
        resolve(connection) {
            return JSON.parse(
                crypto.decrypt(
                    {
                        ciphertext: connection.credentialsCt,
                        iv: connection.credentialsIv,
                        authTag: connection.credentialsAuthTag,
                        salt: connection.credentialsSalt,
                    },
                    pin,
                ),
            );
        },
    };
}
