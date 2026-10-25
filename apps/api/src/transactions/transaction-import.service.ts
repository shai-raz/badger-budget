import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { SyncResultDto } from "../google-sheets/dto";
import { Decimal } from "@prisma/client/runtime/library";
import { findMatchingCategoryId } from "@badger/utils";
import { DEFAULT_CURRENCY_CODE, defaultCategoryIcon } from "@badger/shared-data";
import { resolveCategoryId } from "../google-sheets/category-resolution";
import { resolveDefaultAccountCurrencyId } from "../accounts/default-account-currency";

export interface ImportCandidate {
    externalId: string;
    accountNumber: string; // used to find/create the Account row
    transactionDate: Date;
    postedDate: Date | null;
    amount: number; // absolute value (stored on the transaction)
    signedAmount: number; // signed charged amount; its sign determines income vs. expense
    chargedCurrencyCode: string; // currency of chargedAmount (account currency)
    originalAmount: number | null;
    originalCurrencyCode: string | null;
    description: string;
    additionalDescription: string | null;
    originalCategory: string | null;
    paymentType: string | null; // 'normal' | 'installments' | null
    /**
     * What bank-sync stored for this row before #9 (UTC-truncated Israel-midnight instant). Set only by the IBS
     * adapter; when an existing row with the same externalId and account still holds exactly this value (and it differs from
     * transactionDate), the importer rewrites it. Undefined = no healing (e.g. Google Sheets).
     */
    legacyTransactionDate?: Date;
    /** Same as legacyTransactionDate, for postedDate. */
    legacyPostedDate?: Date | null;
}

const BATCH_SIZE = 100;

type ExistingImportedRow = { id: string; accountId: string; transactionDate: Date; postedDate: Date | null };
type DateFields = { transactionDate?: Date; postedDate?: Date };
/** `from` holds the legacy values the row must still have; `to` the corrected ones. */
type DateCorrection = { from: DateFields; to: DateFields };

/**
 * Importer stays timezone-agnostic: it only replaces a stored value that exactly equals the adapter's legacy value.
 * Anything else (e.g. a user edit) is left alone.
 */
function dateCorrection(row: ExistingImportedRow, c: ImportCandidate): DateCorrection | null {
    const data: DateFields = {};
    const from: DateFields = {};
    if (
        c.legacyTransactionDate &&
        row.transactionDate.getTime() === c.legacyTransactionDate.getTime() &&
        row.transactionDate.getTime() !== c.transactionDate.getTime()
    ) {
        data.transactionDate = c.transactionDate;
        from.transactionDate = row.transactionDate;
    }
    if (
        c.legacyPostedDate &&
        c.postedDate &&
        row.postedDate &&
        row.postedDate.getTime() === c.legacyPostedDate.getTime() &&
        row.postedDate.getTime() !== c.postedDate.getTime()
    ) {
        data.postedDate = c.postedDate;
        from.postedDate = row.postedDate;
    }
    return Object.keys(data).length > 0 ? { from, to: data } : null;
}

@Injectable()
export class TransactionImportService {
    private readonly logger = new Logger(TransactionImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cardPayoffPatternsService: CardPayoffPatternsService,
    ) {}

    async importTransactions(
        userId: string,
        candidates: ImportCandidate[],
        defaultCurrencyCode?: string,
    ): Promise<SyncResultDto> {
        const result: SyncResultDto = {
            success: false,
            transactionsSynced: 0,
            categoriesCreated: 0,
            accountsCreated: 0,
            rowsSkipped: 0,
            warnings: [],
            syncedAt: new Date(),
        };

        try {
            this.logger.log(`Starting import for user ${userId}: ${candidates.length} candidates`);

            // Load existing imported rows (dedup by externalId; dates feed the day-early self-heal)
            const existingRows = await this.prisma.transaction.findMany({
                where: { userId, externalId: { not: null } },
                select: { id: true, accountId: true, externalId: true, transactionDate: true, postedDate: true },
            });
            // externalId is not unique in the schema, so keep a list per id
            const existingByExternalId = new Map<string, ExistingImportedRow[]>();
            for (const row of existingRows) {
                if (row.externalId === null) continue;
                const entry = {
                    id: row.id,
                    accountId: row.accountId,
                    transactionDate: row.transactionDate,
                    postedDate: row.postedDate,
                };
                const list = existingByExternalId.get(row.externalId);
                if (list) list.push(entry);
                else existingByExternalId.set(row.externalId, [entry]);
            }

            this.logger.log(`Found ${existingRows.length} existing transactions by externalId`);

            // Get categories, accounts, currencies for in-memory lookup
            const userCategories = await this.prisma.category.findMany({
                where: {
                    OR: [{ userId }, { isSystem: true }],
                    deletedAt: null,
                },
            });

            const userAccounts = await this.prisma.account.findMany({
                where: { userId, deletedAt: null },
            });

            const currencies = await this.prisma.currency.findMany();
            const currencyBySymbol = new Map(currencies.map((c) => [c.symbol, c.id]));
            const currencyByCode = new Map(currencies.map((c) => [c.code, c.id]));

            const defaultCurrency = currencies.find((c) => c.code === DEFAULT_CURRENCY_CODE);
            if (!defaultCurrency) {
                throw new Error(`Default ${DEFAULT_CURRENCY_CODE} currency not found`);
            }

            const newAccountCurrencyId = await resolveDefaultAccountCurrencyId(
                this.prisma,
                userId,
                defaultCurrencyCode,
                {
                    currencies,
                    fallbackCurrencyId: defaultCurrency.id,
                },
            );

            const createdCategoryNames = new Set<string>();
            const createdAccountNumbers = new Set<string>();
            const categoryByName = new Map(userCategories.map((c) => [c.name, c.id]));
            const accountByNumber = new Map(
                userAccounts
                    .filter((a) => a.accountNumber)
                    .map((a) => [a.accountNumber as string, { id: a.id, currencyId: a.currencyId as string | null }]),
            );

            const transactionsToCreate: any[] = [];
            const dateCorrections: { id: string; data: DateCorrection }[] = [];
            const healedIds = new Set<string>();

            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];

                // Dedup by externalId
                const existingRowsForId = existingByExternalId.get(candidate.externalId);
                if (existingRowsForId) {
                    if (candidate.legacyTransactionDate !== undefined || candidate.legacyPostedDate !== undefined) {
                        const healAccountId = accountByNumber.get(candidate.accountNumber)?.id;
                        for (const row of existingRowsForId) {
                            if (row.accountId !== healAccountId || healedIds.has(row.id)) continue;
                            const data = dateCorrection(row, candidate);
                            if (data) {
                                dateCorrections.push({ id: row.id, data });
                                healedIds.add(row.id);
                            }
                        }
                    }
                    continue;
                }

                // Resolve charged currency (account currency)
                let chargedCurrencyId =
                    currencyBySymbol.get(candidate.chargedCurrencyCode) ||
                    currencyByCode.get(candidate.chargedCurrencyCode.toUpperCase());
                if (!chargedCurrencyId) {
                    result.warnings.push(
                        `Candidate ${i}: Unknown charged currency "${candidate.chargedCurrencyCode}", using ${DEFAULT_CURRENCY_CODE}`,
                    );
                    chargedCurrencyId = defaultCurrency.id;
                }

                // Handle account: find or create
                let accountId: string | null = null;
                let accountCurrencyId: string | null = null;

                if (candidate.accountNumber) {
                    if (accountByNumber.has(candidate.accountNumber)) {
                        const acct = accountByNumber.get(candidate.accountNumber)!;
                        accountId = acct.id;
                        accountCurrencyId = acct.currencyId;
                    } else if (!createdAccountNumbers.has(candidate.accountNumber)) {
                        const newAccount = await this.prisma.account.create({
                            data: {
                                userId,
                                name: candidate.accountNumber,
                                accountNumber: candidate.accountNumber,
                                type: "unknown",
                                currencyId: newAccountCurrencyId,
                                color:
                                    "#" +
                                    Math.floor(Math.random() * 16777215)
                                        .toString(16)
                                        .padStart(6, "0"),
                            },
                        });
                        accountId = newAccount.id;
                        accountCurrencyId = newAccountCurrencyId;
                        accountByNumber.set(candidate.accountNumber, { id: accountId, currencyId: accountCurrencyId });
                        createdAccountNumbers.add(candidate.accountNumber);
                        result.accountsCreated++;
                    }
                }

                if (!accountId) {
                    result.rowsSkipped++;
                    result.warnings.push(`Candidate ${i}: Missing or invalid account number`);
                    continue;
                }

                // Composite natural-key dedup check (safety net for hash mismatches)
                const naturalKeyExists = await this.prisma.transaction.findFirst({
                    where: {
                        userId,
                        accountId,
                        transactionDate: candidate.transactionDate,
                        amount: new Decimal(candidate.amount),
                        description: candidate.description,
                        deletedAt: null,
                    },
                    select: { id: true },
                });

                if (naturalKeyExists) {
                    // Already imported via different path — skip silently
                    continue;
                }

                // Pattern-matched descriptions (e.g. card payoffs) are hidden transfers.
                const isCardPayoffPattern = await this.cardPayoffPatternsService.checkDescription(
                    candidate.description || "Imported",
                    userId,
                );
                // Bank scrapers report money out (charges) as a negative signedAmount and
                // money in (income/refunds) as positive.
                const transactionType = isCardPayoffPattern
                    ? "transfer"
                    : candidate.signedAmount < 0
                      ? "expense"
                      : "income";
                const transferDirection =
                    transactionType === "transfer" ? (candidate.signedAmount < 0 ? "out" : "in") : null;

                // Resolve category
                const categoryId = await resolveCategoryId({
                    categoryName: candidate.originalCategory || "",
                    categoryByName,
                    createdCategoryNames,
                    result,
                    matchCategoryByRules: () =>
                        this.matchCategoryByRules(userId, {
                            originalCategory: candidate.originalCategory || undefined,
                            description: candidate.description,
                            amount: candidate.amount,
                        }),
                    createCategory: () =>
                        this.prisma.category.create({
                            data: {
                                userId,
                                name: candidate.originalCategory!,
                                color:
                                    "#" +
                                    Math.floor(Math.random() * 16777215)
                                        .toString(16)
                                        .padStart(6, "0"),
                                icon: defaultCategoryIcon(candidate.originalCategory!),
                            },
                        }),
                });

                // Determine the currency to store (use account's resolved currency if available)
                const resolvedChargedCurrencyId = accountCurrencyId || chargedCurrencyId;

                // Original currency / amount (only when different from charged currency)
                let originalCurrencyId: string | null = null;
                let parsedOriginalAmount: Decimal | null = null;

                if (candidate.originalCurrencyCode && candidate.originalAmount !== null) {
                    const origCurrId =
                        currencyBySymbol.get(candidate.originalCurrencyCode) ||
                        currencyByCode.get(candidate.originalCurrencyCode.toUpperCase());
                    if (origCurrId && origCurrId !== resolvedChargedCurrencyId) {
                        originalCurrencyId = origCurrId;
                        parsedOriginalAmount = new Decimal(Math.abs(candidate.originalAmount));
                    }
                }

                transactionsToCreate.push({
                    userId,
                    accountId,
                    categoryId,
                    type: transactionType,
                    hidden: isCardPayoffPattern,
                    transferDirection,
                    amount: new Decimal(candidate.amount),
                    currencyId: resolvedChargedCurrencyId,
                    originalAmount: parsedOriginalAmount,
                    originalCurrencyId,
                    description: candidate.description || "Imported",
                    additionalDescription: candidate.additionalDescription || null,
                    originalCategory: candidate.originalCategory || null,
                    externalId: candidate.externalId,
                    paymentType: candidate.paymentType || null,
                    transactionDate: candidate.transactionDate,
                    postedDate: candidate.postedDate,
                });

                // Flush batch when full
                if (transactionsToCreate.length >= BATCH_SIZE) {
                    await this.prisma.transaction.createMany({ data: transactionsToCreate });
                    result.transactionsSynced += transactionsToCreate.length;
                    this.logger.log(`Inserted batch of ${transactionsToCreate.length} transactions`);
                    transactionsToCreate.length = 0;
                }
            }

            // Flush remaining
            if (transactionsToCreate.length > 0) {
                await this.prisma.transaction.createMany({ data: transactionsToCreate });
                result.transactionsSynced += transactionsToCreate.length;
                this.logger.log(`Inserted final batch of ${transactionsToCreate.length} transactions`);
            }

            // Best-effort: a heal failure must never fail an otherwise-good import
            let datesCorrected = 0;
            try {
                for (const c of dateCorrections) {
                    let rowCorrected = false;
                    // Conditional per field: a value edited since we read the row (or healed concurrently) is kept
                    for (const field of ["transactionDate", "postedDate"] as const) {
                        const to = c.data.to[field];
                        const from = c.data.from[field];
                        if (!to || !from) continue;
                        const { count } = await this.prisma.transaction.updateMany({
                            where: { id: c.id, [field]: from },
                            data: { [field]: to },
                        });
                        if (count > 0) {
                            rowCorrected = true;
                            if (field === "transactionDate") {
                                await this.prisma.transaction.updateMany({
                                    where: { counterpartOfId: c.id },
                                    data: { transactionDate: to },
                                });
                            }
                        }
                    }
                    if (rowCorrected) datesCorrected++;
                }
            } catch (error) {
                const message = `Date correction stopped after ${datesCorrected} row(s): ${(error as Error).message}`;
                this.logger.warn(message);
                result.warnings.push(message);
            }

            result.success = true;
            this.logger.log(
                `Import completed: ${result.transactionsSynced} transactions, ${result.categoriesCreated} categories, ${result.accountsCreated} accounts, ${datesCorrected} row(s) with corrected dates`,
            );
        } catch (error) {
            this.logger.error("Import failed", error);
            result.success = false;
            result.error = (error as Error).message || "Unknown error occurred";
        }

        return result;
    }

    private async matchCategoryByRules(
        userId: string,
        transactionData: { originalCategory?: string; description?: string; amount?: number },
    ): Promise<string | null> {
        const rules = await this.prisma.categoryMappingRule.findMany({
            where: { userId, isActive: true },
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        });

        return findMatchingCategoryId(
            {
                description: transactionData.description || "",
                originalCategory: transactionData.originalCategory,
                amount: transactionData.amount,
            },
            rules as any,
        );
    }
}
