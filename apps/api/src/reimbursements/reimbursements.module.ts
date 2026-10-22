import { Module } from "@nestjs/common";
import { ReimbursementsController } from "./reimbursements.controller";
import { ReimbursementsService } from "./reimbursements.service";
import { AmountRuleSource, REIMBURSEMENT_SUGGESTION_SOURCES } from "./suggestion-sources";

@Module({
    controllers: [ReimbursementsController],
    providers: [
        ReimbursementsService,
        { provide: REIMBURSEMENT_SUGGESTION_SOURCES, useFactory: () => [new AmountRuleSource()] },
    ],
    exports: [ReimbursementsService],
})
export class ReimbursementsModule {}
