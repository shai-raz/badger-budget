import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BankSyncController } from "./bank-sync.controller";
import { BankSyncService } from "./bank-sync.service";
import { ScraperService } from "./scraper.service";
import { DebugArtifactService } from "./debug-artifact.service";
import { PrismaModule } from "../prisma/prisma.module";
import { CryptoModule } from "../crypto/crypto.module";
import { TransactionImportModule } from "../transactions/transaction-import.module";
import { AccountsModule } from "../accounts/accounts.module";

@Module({
    imports: [ConfigModule, PrismaModule, CryptoModule, TransactionImportModule, AccountsModule],
    controllers: [BankSyncController],
    providers: [BankSyncService, ScraperService, DebugArtifactService],
    exports: [BankSyncService],
})
export class BankSyncModule {}
