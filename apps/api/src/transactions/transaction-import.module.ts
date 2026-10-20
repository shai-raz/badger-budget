import { Module } from "@nestjs/common";
import { TransactionImportService } from "./transaction-import.service";
import { CardPayoffPatternsModule } from "../card-payoff-patterns/card-payoff-patterns.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
    imports: [PrismaModule, CardPayoffPatternsModule],
    providers: [TransactionImportService],
    exports: [TransactionImportService],
})
export class TransactionImportModule {}
