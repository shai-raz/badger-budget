import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ScrapedAccountType } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { CASH_SHORTFALL_DESCRIPTION, CASH_SURPLUS_DESCRIPTION, isLedgerAccountType } from "@badger/shared-data";
import type { ICashBalanceUpdateResponse } from "@badger/types";
import { CreateAccountDto, UpdateAccountDto } from "./dto/account.dto";
import { UpdateCashBalanceDto } from "./dto/update-cash-balance.dto";
import { AccountResponseDto } from "../transactions/dto/account-response.dto";
import { toAccountResponse } from "./account-response.mapper";
import { computeCashStats } from "./cash-balance";
import type { Account, Currency, Prisma } from "@prisma/client";

@Injectable()
export class AccountsService {
    constructor(private prisma: PrismaService) {}

    /** Ledger accounts (cash, savings) always have a currency (their transactions must use it). */
    private assertLedgerHasCurrency(type: string, currencyId: string | null | undefined): void {
        if (isLedgerAccountType(type) && !currencyId) {
            throw new BadRequestException(`A ${type} account needs a currency`);
        }
    }

    /**
     * Maps rows to the response shape and overlays the computed ledger fields (balance, balance kind,
     * last transaction date, linked flag) on ledger accounts that have transactions. Cash reports
     * `cash_on_hand`; savings reports `account_balance`.
     */
    private async withCashStats(
        userId: string,
        rows: Array<Account & { currency: Currency | null }>,
        db: Prisma.TransactionClient | PrismaService = this.prisma,
    ): Promise<AccountResponseDto[]> {
        const ledgerIds = rows.filter((r) => isLedgerAccountType(r.type)).map((r) => r.id);
        const stats = await computeCashStats(db, userId, ledgerIds);
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

    /** Cash stats for one account; undefined when it has no non-deleted transactions. */
    private async cashStatsFor(userId: string, accountId: string) {
        return (await computeCashStats(this.prisma, userId, [accountId])).get(accountId);
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

        return (await this.withCashStats(userId, [account]))[0];
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

        return this.withCashStats(userId, accounts);
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

        return (await this.withCashStats(userId, [account]))[0];
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
            updateAccountDto.type ?? current.type,
            updateAccountDto.currencyId !== undefined ? updateAccountDto.currencyId : current.currencyId,
        );

        const resultingCurrencyId =
            updateAccountDto.currencyId !== undefined ? updateAccountDto.currencyId : current.currencyId;

        if (isLedgerAccountType(current.type)) {
            const currencyChanges =
                updateAccountDto.currencyId !== undefined && updateAccountDto.currencyId !== current.currencyId;
            // A type change between ledger types (cash <-> savings) still counts as a type change.
            const typeChanges = updateAccountDto.type !== undefined && updateAccountDto.type !== current.type;
            const stats = currencyChanges || typeChanges ? await this.cashStatsFor(userId, id) : undefined;
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

        return (await this.withCashStats(userId, [account]))[0];
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
     * Sets a cash account's balance to what the user actually has. The server computes the difference
     * against the computed balance (the client's view may be stale) and records it: a shortfall becomes
     * an uncategorized expense, a surplus a transfer-in. Concurrent calls serialize on the account row.
     */
    async updateCashBalance(
        id: string,
        userId: string,
        dto: UpdateCashBalanceDto,
    ): Promise<ICashBalanceUpdateResponse> {
        return this.prisma.$transaction(async (tx) => {
            const account = await tx.account.findFirst({
                where: { id, userId, deletedAt: null },
                include: { currency: true },
            });
            if (!account) {
                throw new NotFoundException(`Account with ID ${id} not found`);
            }
            if (account.type !== "cash") {
                throw new BadRequestException("Only cash accounts have a balance you can update");
            }
            if (!account.currencyId) {
                throw new BadRequestException("A cash account needs a currency");
            }

            // Takes the row lock so concurrent updates serialize.
            await tx.account.update({ where: { id }, data: { updatedAt: new Date() } });

            const current = (await computeCashStats(tx, userId, [id])).get(id)?.balance ?? 0;
            const diff = Math.round(dto.amount * 100) - Math.round(current * 100);

            let adjustment: ICashBalanceUpdateResponse["adjustment"] = null;
            if (diff !== 0) {
                const base = {
                    userId,
                    accountId: id,
                    currencyId: account.currencyId,
                    transactionDate: new Date(dto.date),
                    categoryId: null,
                };
                const created = await tx.transaction.create({
                    data:
                        diff < 0
                            ? { ...base, type: "expense", amount: -diff / 100, description: CASH_SHORTFALL_DESCRIPTION }
                            : {
                                  ...base,
                                  type: "transfer",
                                  transferDirection: "in",
                                  amount: diff / 100,
                                  description: CASH_SURPLUS_DESCRIPTION,
                              },
                });
                adjustment = {
                    id: created.id,
                    type: diff < 0 ? "expense" : "transfer",
                    amount: Math.abs(diff) / 100,
                };
            }

            const [response] = await this.withCashStats(userId, [account], tx);
            return { account: response as ICashBalanceUpdateResponse["account"], adjustment };
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
