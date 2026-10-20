import { Module } from "@nestjs/common";
import { AccountsService } from "./accounts.service";
import { AccountsController } from "./accounts.controller";
import { AccountBalanceService } from "./account-balance.service";

@Module({
    controllers: [AccountsController],
    providers: [AccountsService, AccountBalanceService],
    exports: [AccountsService, AccountBalanceService],
})
export class AccountsModule {}
