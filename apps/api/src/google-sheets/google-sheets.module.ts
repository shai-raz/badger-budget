import { Module } from "@nestjs/common";
import { GoogleSheetsController } from "./google-sheets.controller";
import { GoogleSheetsService } from "./google-sheets.service";
import { CardPayoffPatternsModule } from "../card-payoff-patterns/card-payoff-patterns.module";
import { TransactionImportModule } from "../transactions/transaction-import.module";

@Module({
    imports: [CardPayoffPatternsModule, TransactionImportModule],
    controllers: [GoogleSheetsController],
    providers: [GoogleSheetsService],
    exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
