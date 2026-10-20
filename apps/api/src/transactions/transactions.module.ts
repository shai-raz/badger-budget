import { Module } from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { TransactionsController } from "./transactions.controller";
import { CardPayoffPatternsModule } from "../card-payoff-patterns/card-payoff-patterns.module";
import { FxConversionService } from "./fx-conversion.service";

@Module({
    imports: [CardPayoffPatternsModule],
    controllers: [TransactionsController],
    providers: [TransactionsService, FxConversionService],
    exports: [TransactionsService, FxConversionService],
})
export class TransactionsModule {}
