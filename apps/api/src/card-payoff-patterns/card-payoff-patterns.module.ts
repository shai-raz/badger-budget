import { Module } from "@nestjs/common";
import { CardPayoffPatternsService } from "./card-payoff-patterns.service";
import { CardPayoffPatternsController } from "./card-payoff-patterns.controller";

@Module({
    controllers: [CardPayoffPatternsController],
    providers: [CardPayoffPatternsService],
    exports: [CardPayoffPatternsService],
})
export class CardPayoffPatternsModule {}
