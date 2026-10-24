import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { UpdateCashBalanceDto } from "./dto/update-cash-balance.dto";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("accounts")
@Controller("accounts")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) {}

    @Post()
    @ApiOperation({ summary: "Create a new account" })
    @ApiResponse({ status: 201, description: "Account created successfully" })
    create(@Body() createAccountDto: CreateAccountDto, @CurrentUser() user: any) {
        return this.accountsService.create(user.id, createAccountDto);
    }

    @Get()
    @ApiOperation({ summary: "Get all accounts for current user" })
    @ApiResponse({ status: 200, description: "List of accounts" })
    findAll(@CurrentUser() user: any) {
        return this.accountsService.findAll(user.id);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get account by ID" })
    @ApiResponse({ status: 200, description: "Account found" })
    @ApiResponse({ status: 404, description: "Account not found" })
    findOne(@Param("id") id: string, @CurrentUser() user: any) {
        return this.accountsService.findOne(id, user.id);
    }

    @Patch(":id")
    @ApiOperation({ summary: "Update account" })
    @ApiResponse({ status: 200, description: "Account updated successfully" })
    @ApiResponse({ status: 404, description: "Account not found" })
    update(@Param("id") id: string, @Body() updateAccountDto: UpdateAccountDto, @CurrentUser() user: any) {
        return this.accountsService.update(id, user.id, updateAccountDto);
    }

    @Post(":id/cash-balance")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Set a cash or savings account's balance; records the difference as an adjustment" })
    @ApiResponse({ status: 200, description: "Updated account and the adjustment transaction, if any" })
    @ApiResponse({ status: 400, description: "Not a cash or savings account" })
    @ApiResponse({ status: 404, description: "Account not found" })
    updateCashBalance(@Param("id") id: string, @Body() dto: UpdateCashBalanceDto, @CurrentUser() user: any) {
        return this.accountsService.updateCashBalance(id, user.id, dto);
    }

    @Delete(":id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: "Delete account (soft delete)" })
    @ApiResponse({ status: 204, description: "Account deleted successfully" })
    @ApiResponse({ status: 404, description: "Account not found" })
    async remove(@Param("id") id: string, @CurrentUser() user: any) {
        await this.accountsService.remove(id, user.id);
    }
}
