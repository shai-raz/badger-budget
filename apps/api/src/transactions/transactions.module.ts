import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { TransactionsService } from "./transactions.service";
import { TransactionsController } from "./transactions.controller";
import { CardPayoffPatternsModule } from "../card-payoff-patterns/card-payoff-patterns.module";
import { FxConversionService } from "./fx-conversion.service";
import { AttachmentStorageModule } from "./attachments/attachment-storage.module";
import { TransactionAttachmentsService } from "./attachments/transaction-attachments.service";
import { TransactionAttachmentsController } from "./attachments/transaction-attachments.controller";

@Module({
    imports: [
        CardPayoffPatternsModule,
        AttachmentStorageModule,
        // Per-user upload limit is applied through AttachmentUploadThrottlerGuard; the controller's @Throttle sets it.
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ],
    controllers: [TransactionsController, TransactionAttachmentsController],
    providers: [TransactionsService, FxConversionService, TransactionAttachmentsService],
    exports: [TransactionsService, FxConversionService, TransactionAttachmentsService],
})
export class TransactionsModule {}
