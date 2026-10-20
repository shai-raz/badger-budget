import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels, getSchemaPath } from "@nestjs/swagger";
import { TransactionsService } from "./transactions.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { CreateTransactionAttachmentDto } from "./dto/create-transaction-attachment.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { TransactionResponseDto } from "./dto/transaction-response.dto";
import { TransactionAttachmentResponseDto } from "./dto/transaction-attachment-response.dto";
import { ListTransactionsQueryDto } from "./dto/list-transactions-query.dto";
import { SummaryTransactionsQueryDto } from "./dto/summary-transactions-query.dto";
import { PaginatedTransactionsResponseDto } from "./dto/transaction-list-response.dto";
import { TransactionsSummaryResponseDto } from "./dto/transactions-summary-response.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("transactions")
@Controller("transactions")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) {}

    @Post()
    @ApiOperation({ summary: "Create a new transaction" })
    @ApiResponse({ status: 201, description: "Transaction created successfully", type: TransactionResponseDto })
    create(
        @Body() createTransactionDto: CreateTransactionDto,
        @CurrentUser() user: any,
    ): Promise<TransactionResponseDto> {
        return this.transactionsService.create(user.id, createTransactionDto);
    }

    @Get()
    @ApiOperation({
        summary: "List transactions with optional filters, pagination, search and sorting",
        description:
            "When the `page` query param is present the response is a paginated envelope " +
            "(`PaginatedTransactionsResponseDto`) and all filters (search, categoryIds, type, " +
            "includeHidden, date range, sort) apply. When `page` is absent the endpoint returns the " +
            "legacy unpaginated `TransactionResponseDto[]` array with no hidden filtering — this " +
            "unpaginated array shape is deprecated; new clients should send `page`.",
    })
    @ApiResponse({
        status: 200,
        description:
            "Paginated envelope when `page` is present, otherwise the deprecated unpaginated array of transactions.",
        schema: {
            oneOf: [
                { $ref: getSchemaPath(PaginatedTransactionsResponseDto) },
                { type: "array", items: { $ref: getSchemaPath(TransactionResponseDto) } },
            ],
        },
    })
    @ApiExtraModels(PaginatedTransactionsResponseDto, TransactionResponseDto)
    findAll(
        @Query() query: ListTransactionsQueryDto,
        @CurrentUser() user?: any,
    ): Promise<TransactionResponseDto[] | PaginatedTransactionsResponseDto> {
        return this.transactionsService.findAll(user.id, query);
    }

    // NOTE: this MUST stay above `@Get(":id")` — otherwise "summary" is
    // captured as an :id and routed to findOne.
    @Get("summary")
    @ApiOperation({
        summary: "Aggregate totals (income/expenses/net/transferred/available) for the filtered list",
        description:
            "Applies the same filters as `GET /transactions` (search, type, categoryIds, date range) but " +
            "ALWAYS excludes hidden transactions. Amounts are naive single-currency sums with NO FX " +
            "conversion; `currencyCode` is a display hint from the most recent matching transaction " +
            "(fallback 'ILS').",
    })
    @ApiResponse({
        status: 200,
        description: "Aggregate totals for the filtered transactions.",
        type: TransactionsSummaryResponseDto,
    })
    getSummary(
        @Query() query: SummaryTransactionsQueryDto,
        @CurrentUser() user: any,
    ): Promise<TransactionsSummaryResponseDto> {
        return this.transactionsService.getSummary(user.id, query);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get transaction by ID" })
    @ApiResponse({ status: 200, description: "Transaction found", type: TransactionResponseDto })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any): Promise<TransactionResponseDto> {
        return this.transactionsService.findOne(id, user.id);
    }

    @Patch(":id")
    @ApiOperation({ summary: "Update transaction" })
    @ApiResponse({ status: 200, description: "Transaction updated successfully", type: TransactionResponseDto })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    update(
        @Param("id") id: string,
        @Body() updateTransactionDto: UpdateTransactionDto,
        @CurrentUser() user: any,
    ): Promise<TransactionResponseDto> {
        return this.transactionsService.update(id, user.id, updateTransactionDto);
    }

    @Post(":id/mark-card-payoff")
    @ApiOperation({ summary: "Mark transaction as a card payoff and hide all matching transactions as transfers" })
    @ApiResponse({ status: 200, description: "Pattern created and transactions updated" })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    async markCardPayoffPattern(
        @Param("id") id: string,
        @Body("description") description: string,
        @CurrentUser() user: any,
    ) {
        return this.transactionsService.markAsCardPayoff(id, user.id, description);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete transaction (soft delete)" })
    @ApiResponse({ status: 204, description: "Transaction deleted successfully" })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    async remove(@Param("id") id: string, @CurrentUser() user: any) {
        await this.transactionsService.remove(id, user.id);
    }

    @Post(":id/attachments")
    @ApiOperation({
        summary: "Add an attachment to a transaction (metadata only — file upload comes in a later phase)",
    })
    @ApiResponse({
        status: 201,
        description: "Attachment created successfully",
        type: TransactionAttachmentResponseDto,
    })
    @ApiResponse({ status: 404, description: "Transaction not found" })
    addAttachment(
        @Param("id") id: string,
        @Body() createAttachmentDto: CreateTransactionAttachmentDto,
        @CurrentUser() user: any,
    ): Promise<TransactionAttachmentResponseDto> {
        return this.transactionsService.addAttachment(id, user.id, createAttachmentDto);
    }

    @Delete(":id/attachments/:attachmentId")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete a transaction attachment (soft delete)" })
    @ApiResponse({ status: 204, description: "Attachment deleted successfully" })
    @ApiResponse({ status: 404, description: "Attachment not found" })
    async removeAttachment(
        @Param("id") id: string,
        @Param("attachmentId") attachmentId: string,
        @CurrentUser() user: any,
    ) {
        await this.transactionsService.removeAttachment(id, attachmentId, user.id);
    }
}
