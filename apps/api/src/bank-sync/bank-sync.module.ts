import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BankSyncController } from "./bank-sync.controller";
import { BankSyncService } from "./bank-sync.service";
import { AutoSyncController } from "./auto-sync.controller";
import { AutoSyncService } from "./auto-sync.service";
import { AutoSyncCleanupService } from "./auto-sync-cleanup.service";
import { ScraperService } from "./scraper.service";
import { DebugArtifactService } from "./debug-artifact.service";
import { SyncRecoveryService } from "./sync-recovery.service";
import { SyncErrorCodeBackfillService } from "./sync-error-code-backfill.service";
import { PrismaModule } from "../prisma/prisma.module";
import { CryptoModule } from "../crypto/crypto.module";
import { TransactionImportModule } from "../transactions/transaction-import.module";
import { AccountsModule } from "../accounts/accounts.module";

@Module({
    imports: [ConfigModule, PrismaModule, CryptoModule, TransactionImportModule, AccountsModule],
    controllers: [BankSyncController, AutoSyncController],
    providers: [
        BankSyncService,
        AutoSyncService,
        AutoSyncCleanupService,
        ScraperService,
        DebugArtifactService,
        SyncRecoveryService,
        SyncErrorCodeBackfillService,
    ],
    exports: [BankSyncService],
})
export class BankSyncModule {}
