import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AccountType, LedgerAccountType, ScrapedAccountType } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import {
    CASH_SHORTFALL_DESCRIPTION,
    CASH_SURPLUS_DESCRIPTION,
    SAVINGS_ADJUSTMENT_DESCRIPTION,
    isLedgerAccountType,
    parseAccountType,
} from "@badger/shared-data";
import type { ILedgerBalanceUpdateResponse } from "@badger/types";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";
import { UpdateLedgerBalanceDto } from "./dto/update-ledger-balance.dto";
import { AccountResponseDto } from "../transactions/dto/account-response.dto";
import { toAccountResponse } from "./account-response.mapper";
import { computeLedgerStats } from "./ledger-balance";
import type { Account, Currency, Prisma } from "@prisma/client";

type BalanceAdjustmentFields =
    | { type: "expense"; description: string }
    | { type: "transfer"; transferDirection: "in" | "out"; description: string };

/** The transaction fields recorded when a ledger account's balance is set to a new value (diff is in cents). */
function describeBalanceAdjustment(accountType: LedgerAccountType, diff: number): BalanceAdjustmentFields {
    if (accountType === "savings") {
        return {
            type: "transfer",
            transferDirection: diff > 0 ? "in" : "out",
            description: SAVINGS_ADJUSTMENT_DESCRIPTION,
        };
    }
    if (diff < 0) {
        return { type: "expense", description: CASH_SHORTFALL_DESCRIPTION };
    }
    return { type: "transfer", transferDirection: "in", description: CASH_SURPLUS_DESCRIPTION };
}

@Injectable()
export class AccountsService {
    constructor(private prisma: PrismaService) {}

    /** Ledger accounts (cash, savings) always have a currency (their transactions must use it). */
    private assertLedgerHasCurrency(type: AccountType, currencyId: string | null | undefined): void {
        if (isLedgerAccountType(type) && !currencyId) {
            throw new BadRequestException(`A ${type} account needs a currency`);
        }
    }

    /**
     * Maps rows to the response shape and overlays the computed ledger fields (balance, balance kind,
     * last transaction date, linked flag) on ledger accounts that have transactions. Cash reports
     * `cash_on_hand`; savings reports `account_balance`.
     */
    private async withLedgerStats(
        userId: string,
        rows: Array<Account & { currency: Currency | null }>,
        db: Prisma.TransactionClient | PrismaService = this.prisma,
    ): Promise<AccountResponseDto[]> {
        const ledgerIds = rows.filter((r) => isLedgerAccountType(r.type)).map((r) => r.id);
        const stats = await computeLedgerStats(db, userId, ledgerIds);
        return rows.map((row) => {
            const response = toAccountResponse(row);
            const s = isLedgerAccountType(row.type) ? stats.get(row.id) : undefined;
            if (!s) return response;
            return {
                ...response,
                balance: s.balance,
                balanceKind: row.type === "cash" ? "cash_on_hand" : "account_balance",
                lastTransactionDate: s.lastTransactionDate,
                hasLinkedTransfers: s.hasLinkedTransfers,
                // An entry exists only when the account has non-deleted rows.
                hasTransactions: true,
            };
        });
    }

    /** Ledger stats for one account; undefined when it has no non-deleted transactions. */
    private async ledgerStatsFor(userId: string, accountId: string) {
        return (await computeLedgerStats(this.prisma, userId, [accountId])).get(accountId);
    }

    async create(userId: string, createAccountDto: CreateAccountDto): Promise<AccountResponseDto> {
        this.assertLedgerHasCurrency(createAccountDto.type, createAccountDto.currencyId);
        const account = await this.prisma.account.create({
            data: {
                ...createAccountDto,
                userId,
            },
            include: { currency: true },
        });

        return (await this.withLedgerStats(userId, [account]))[0];
    }

    async findAll(userId: string): Promise<AccountResponseDto[]> {
        const accounts = await this.prisma.account.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
            include: { currency: true },
        });

        return this.withLedgerStats(userId, accounts);
    }

    async findOne(id: string, userId: string): Promise<AccountResponseDto> {
        const account = await this.prisma.account.findFirst({
            where: {
                id,
                userId,
                deletedAt: null,
            },
            include: { currency: true },
        });

        if (!account) {
            throw new NotFoundException(`Account with ID ${id} not found`);
        }

        return (await this.withLedgerStats(userId, [account]))[0];
    }

    async update(id: string, userId: string, updateAccountDto: UpdateAccountDto): Promise<AccountResponseDto> {
        const current = await this.prisma.account.findFirst({
            where: { id, userId, deletedAt: null },
            select: { type: true, currencyId: true },
        });
        if (!current) {
            throw new NotFoundException(`Account with ID ${id} not found`);
        }
        this.assertLedgerHasCurrency(
            updateAccountDto.type ?? parseAccountType(current.type),
            updateAccountDto.currencyId !== undefined ? updateAccountDto.currencyId : current.currencyId,
        );

        const resultingCurrencyId =
            updateAccountDto.currencyId !== undefined ? updateAccountDto.currencyId : current.currencyId;

        if (isLedgerAccountType(current.type)) {
            const currencyChanges =
                updateAccountDto.currencyId !== undefined && updateAccountDto.currencyId !== current.currencyId;
            // A type change between ledger types (cash <-> savings) still counts as a type change.
            const typeChanges = updateAccountDto.type !== undefined && updateAccountDto.type !== current.type;
            const stats = currencyChanges || typeChanges ? await this.ledgerStatsFor(userId, id) : undefined;
            if (stats?.hasLinkedTransfers) {
                if (currencyChanges) {
                    throw new BadRequestException("This account has linked transfers, so its currency can't change");
                }
                if (typeChanges) {
                    throw new BadRequestException("This account has linked transfers, so its type can't change");
                }
            }
            // One currency per ledger account: any transaction on the account pins it.
            if (currencyChanges && stats) {
                throw new BadRequestException("This account has transactions, so its currency can't change");
            }
        }

        // Becoming a ledger account (cash or savings): every existing transaction must already be in its currency.
        if (!isLedgerAccountType(current.type) && isLedgerAccountType(updateAccountDto.type) && resultingCurrencyId) {
            const otherCurrency = await this.prisma.transaction.count({
                where: { accountId: id, userId, deletedAt: null, currencyId: { not: resultingCurrencyId } },
            });
            if (otherCurrency > 0) {
                throw new BadRequestException(
                    `This account has transactions in another currency, so it can't become a ${updateAccountDto.type} account`,
                );
            }
        }

        const account = await this.prisma.account.update({
            where: { id },
            data: updateAccountDto,
            include: { currency: true },
        });

        return (await this.withLedgerStats(userId, [account]))[0];
    }

    /**
     * Classifies accounts that bank sync auto-created, using the type implied by the provider.
     *
     * The `type: "unknown"` predicate lives in the `where` so the filter is atomic rather than a
     * read-modify-write that can race, and so the sweep is idempotent — a second run matches
     * nothing. Soft-deleted rows are left alone, matching `AccountBalanceService`'s refusal to
     * touch them. It's not a guarantee against clobbering a user-set type, though: the web form and
     * `UpdateAccountDto` both accept `"unknown"`, so a type deliberately reset to `"unknown"` gets
     * re-typed on the next sync. Fixing that means dropping `"unknown"` from the UI/DTO — out of
     * scope here.
     *
     * @returns how many accounts were reclassified.
     */
    async upgradeUnknownAccountTypes(
        userId: string,
        accountNumbers: string[],
        type: ScrapedAccountType | null,
    ): Promise<number> {
        // `null` means the provider is unrecognized or deliberately unclassified (e.g. Beyhad
        // Bishvilha) — either way there's nothing to type. `{ in: [] }` is worth avoiding outright.
        if (type === null || accountNumbers.length === 0) return 0;

        const { count } = await this.prisma.account.updateMany({
            where: {
                userId,
                accountNumber: { in: accountNumbers },
                type: "unknown",
                deletedAt: null,
            },
            data: { type },
        });

        return count;
    }

    /**
     * Sets a cash or savings account's balance to what the user actually has. The server computes the
     * difference against the computed balance (the client's view may be stale) and records it. For cash,
     * a shortfall becomes an uncategorized expense and a surplus a transfer-in. For savings, either
     * direction is a transfer (in or out), recorded as a "Savings adjustment". Concurrent calls serialize
     * on the account row.
     */
    async updateLedgerBalance(
        id: string,
        userId: string,
        dto: UpdateLedgerBalanceDto,
    ): Promise<ILedgerBalanceUpdateResponse> {
        return this.prisma.$transaction(async (tx) => {
            const account = await tx.account.findFirst({
                where: { id, userId, deletedAt: null },
                include: { currency: true },
            });
            if (!account) {
                throw new NotFoundException(`Account with ID ${id} not found`);
            }
            if (!isLedgerAccountType(account.type)) {
                throw new BadRequestException("Only cash and savings accounts have a balance you can update");
            }
            if (!account.currencyId) {
                throw new BadRequestException(`A ${account.type} account needs a currency`);
            }

            // Takes the row lock so concurrent updates serialize.
            await tx.account.update({ where: { id }, data: { updatedAt: new Date() } });

            const current = (await computeLedgerStats(tx, userId, [id])).get(id)?.balance ?? 0;
            const diff = Math.round(dto.amount * 100) - Math.round(current * 100);

            let adjustment: ILedgerBalanceUpdateResponse["adjustment"] = null;
            if (diff !== 0) {
                const fields = describeBalanceAdjustment(account.type, diff);
                const amount = Math.abs(diff) / 100;
                const created = await tx.transaction.create({
                    data: {
                        userId,
                        accountId: id,
                        currencyId: account.currencyId,
                        transactionDate: new Date(dto.date),
                        categoryId: null,
                        amount,
                        ...fields,
                    },
                });
                adjustment = { id: created.id, type: fields.type, amount };
            }

            const [response] = await this.withLedgerStats(userId, [account], tx);
            return { account: response as ILedgerBalanceUpdateResponse["account"], adjustment };
        });
    }

    async remove(id: string, userId: string) {
        const account = await this.findOne(id, userId); // Check if exists
        if (isLedgerAccountType(account.type) && account.hasLinkedTransfers) {
            throw new BadRequestException(
                "This account has linked transfers. Revert or re-point them before deleting it.",
            );
        }

        // Soft delete
        return this.prisma.account.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
}
