import { Module } from "@nestjs/common";
import { CurrenciesService } from "./currencies.service";
import { CurrenciesController } from "./currencies.controller";

@Module({
    controllers: [CurrenciesController],
    providers: [CurrenciesService],
    exports: [CurrenciesService],
})
export class CurrenciesModule {}
