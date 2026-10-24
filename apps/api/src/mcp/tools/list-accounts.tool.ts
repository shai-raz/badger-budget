import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { AccountsService } from "../../accounts/accounts.service";
import { maskAccountNumber, toColumnar, toIsoDate } from "./columnar";
import type { McpToolDefinition } from "./tool.types";

const inputSchema = z.object({}).strict();

const COLUMNS = [
    "id",
    "name",
    "type",
    "currency",
    "balance",
    "balanceKind",
    "balanceDate",
    "cardFrame",
    "cardIssuer",
    "accountNumberMasked",
] as const;

@Injectable()
export class ListAccountsTool implements McpToolDefinition<typeof inputSchema> {
    readonly name = "list_accounts";
    readonly title = "List accounts";
    readonly description =
        "Lists the user's accounts (bank, credit card, cash, savings) as columnar rows. " +
        "`balance` is the latest observation captured from the bank, and its meaning depends on `balanceKind`: " +
        "`account_balance` is money in the account, `next_charge` is what leaves the bank account on the next debit date, " +
        "`utilized_credit` is the credit line consumed so far, and `cash_on_hand` is a cash account's computed balance from its own transactions (not a bank observation, never summed with other kinds). " +
        "A savings account's balance is also computed from its transactions, but is reported as `account_balance`. Balances of different kinds or different currencies " +
        "must not be summed together. `balanceDate` is the date of that observation; accounts without bank sync have null balance fields. " +
        "`cardFrame` is a credit card's credit limit; it is not summable across cards because one group-level limit " +
        "can be reported on every card of the same issuer agreement. `accountNumberMasked` shows only the last 4 characters.";
    readonly inputSchema = inputSchema;

    constructor(private readonly accounts: AccountsService) {}

    async execute(userId: string): Promise<unknown> {
        const accounts = await this.accounts.findAll(userId);
        return toColumnar(
            COLUMNS,
            accounts.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                currency: a.currency?.code ?? null,
                balance: a.balance,
                balanceKind: a.balanceKind,
                balanceDate: toIsoDate(a.balanceDate),
                cardFrame: a.cardFrame,
                cardIssuer: a.cardIssuer,
                accountNumberMasked: maskAccountNumber(a.accountNumber),
            })),
        );
    }
}
