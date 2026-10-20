import { Module } from "@nestjs/common";
import { CashWithdrawalPatternsService } from "./cash-withdrawal-patterns.service";
import { CashWithdrawalPatternsController } from "./cash-withdrawal-patterns.controller";

@Module({
    controllers: [CashWithdrawalPatternsController],
    providers: [CashWithdrawalPatternsService],
})
export class CashWithdrawalPatternsModule {}
