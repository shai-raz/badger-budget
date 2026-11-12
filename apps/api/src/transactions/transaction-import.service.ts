import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { SyncResultDto } from "../google-sheets/dto";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { runRules } from "@badger/utils";
import { DEFAULT_CURRENCY_CODE, defaultCategoryIcon } from "@badger/shared-data";
import { resolveCategoryId } from "../google-sheets/category-resolution";
import { resolveDefaultAccountCurrencyId } from "../accounts/default-account-currency";
import { loadMatchableRules } from "../rules/rule-mapping";
import { loadUserSettings } from "../auth/user-settings";
import { DEDUP_TIERS, DedupTier, StoredRow, matchStoredRows } from "./import-dedup";

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
     * adapter; when the stored row this candidate matches (same account) still holds exactly this value (and it differs
     * from transactionDate), the importer rewrites it. Undefined = no healing (e.g. Google Sheets).
     */
    legacyTransactionDate?: Date;
    /** Same as legacyTransactionDate, for postedDate. */
    legacyPostedDate?: Date | null;
}

const BATCH_SIZE = 100;

const MS_PER_DAY = 86_400_000;
const MAX_ERROR_LENGTH = 300;
const MAX_LOGGED_WARNINGS = 20;

type DateFields = { transactionDate?: Date; postedDate?: Date };
/** `from` holds the legacy values the row must still have; `to` the corrected ones. */
type DateCorrection = { from: DateFields; to: DateFields };

/**
 * Importer stays timezone-agnostic: it only replaces a stored value that exactly equals the adapter's legacy value.
 * Anything else (e.g. a user edit) is left alone.
 */
function dateCorrection(row: StoredRow, c: ImportCandidate): DateCorrection | null {
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

            // Loaded once for the whole import: every row runs the same rule set.
            const rules = await loadMatchableRules(this.prisma, userId);
            // Loaded once per import, like the rules: sync jobs have no JWT, so the mode is read here, not per request.
            const { unmatchedImportCategory } = await loadUserSettings(this.prisma, userId);

            const createdCategoryNames = new Set<string>();
            const createdAccountNumbers = new Set<string>();
            const categoryByName = new Map(userCategories.map((c) => [c.name, c.id]));
            const accountByNumber = new Map(
                userAccounts
                    .filter((a) => a.accountNumber)
                    .map((a) => [a.accountNumber as string, { id: a.id, currencyId: a.currencyId as string | null }]),
            );

            // Dedup: pair candidates with stored rows one-to-one (see import-dedup.ts). Loaded once, up front.
            const storedRows = await this.loadStoredRows(userId, candidates);
            const storedExternalIds = new Set(storedRows.map((row) => row.externalId));
            const matches = matchStoredRows(
                candidates.map((candidate) => ({
                    externalId: candidate.externalId,
                    accountId: accountByNumber.get(candidate.accountNumber)?.id,
                    transactionDate: candidate.transactionDate,
                    legacyTransactionDate: candidate.legacyTransactionDate,
                    amount: candidate.amount,
                    description: candidate.description,
                })),
                storedRows,
            );
            const matchedByTier = Object.fromEntries(DEDUP_TIERS.map((tier) => [tier, 0])) as Record<DedupTier, number>;
            // Rows the old id-only check dropped: new, although their externalId is already stored.
            let insertedWithStoredId = 0;

            const transactionsToCreate: Prisma.TransactionCreateManyInput[] = [];
            const dateCorrections: { id: string; data: DateCorrection }[] = [];
            const failures = { count: 0, firstError: "" };
            const flush = async () => {
                if (transactionsToCreate.length === 0) return;
                const batch = transactionsToCreate.splice(0);
                const inserted = await this.insertBatch(batch, failures);
                result.transactionsSynced += inserted;
                result.rowsSkipped += batch.length - inserted;
            };

            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];

                const match = matches[i];
                if (match) {
                    matchedByTier[match.tier]++;
                    if (match.row.accountId === accountByNumber.get(candidate.accountNumber)?.id) {
                        const data = dateCorrection(match.row, candidate);
                        if (data) dateCorrections.push({ id: match.row.id, data });
                    }
                    continue;
                }
                if (storedExternalIds.has(candidate.externalId)) insertedWithStoredId++;

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
                        runRules(
                            {
                                description: candidate.description || "",
                                originalCategory: candidate.originalCategory || null,
                                amount: candidate.amount,
                                accountId,
                                type: transactionType,
                            },
                            rules,
                        ).categoryId,
                    mode: unmatchedImportCategory,
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

                if (transactionsToCreate.length >= BATCH_SIZE) await flush();
            }
            await flush();

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

            const alreadyStored = DEDUP_TIERS.map((tier) => `${tier}=${matchedByTier[tier]}`).join(" ");
            this.logger.log(
                `Import completed: ${result.transactionsSynced} transactions (${insertedWithStoredId} new with an externalId that was already stored), ${result.categoriesCreated} categories, ${result.accountsCreated} accounts, ${datesCorrected} row(s) with corrected dates; already stored: ${alreadyStored}`,
            );
            if (result.warnings.length > 0) {
                this.logger.warn(
                    `Import warnings (${result.warnings.length}): ${result.warnings.slice(0, MAX_LOGGED_WARNINGS).join("; ")}`,
                );
            }

            if (failures.count > 0) {
                // The rows that did save stay; a repeated import only adds what is still missing.
                result.error = `${failures.count} transaction(s) could not be saved: ${failures.firstError}`;
                this.logger.error(`Import incomplete: ${result.error}`);
            } else {
                result.success = true;
            }
        } catch (error) {
            this.logger.error("Import failed", error);
            result.success = false;
            result.error = (error as Error).message || "Unknown error occurred";
        }

        return result;
    }

    /**
     * Everything a candidate could already be stored as: every row with an externalId (deleted ones too, so a
     * transaction the user deleted stays deleted), plus the live rows on the candidates' days for the look-alike tier.
     */
    private loadStoredRows(userId: string, candidates: ImportCandidate[]): Promise<StoredRow[]> {
        const withExternalId = { externalId: { not: null } };
        const days = candidates.map((c) => Math.floor(c.transactionDate.getTime() / MS_PER_DAY));
        const where =
            days.length === 0
                ? { userId, ...withExternalId }
                : {
                      userId,
                      OR: [
                          withExternalId,
                          {
                              deletedAt: null,
                              transactionDate: {
                                  gte: new Date(days.reduce((a, b) => Math.min(a, b)) * MS_PER_DAY),
                                  lte: new Date(days.reduce((a, b) => Math.max(a, b)) * MS_PER_DAY),
                              },
                          },
                      ],
                  };
        return this.prisma.transaction.findMany({
            where,
            select: {
                id: true,
                accountId: true,
                externalId: true,
                transactionDate: true,
                postedDate: true,
                amount: true,
                description: true,
                deletedAt: true,
            },
        });
    }

    /**
     * Inserts a batch and returns how many rows were saved. When the batch is rejected, its rows are retried one
     * by one, so a single bad row can't take the rest of the batch (and every later sync of it) down with it.
     */
    private async insertBatch(
        rows: Prisma.TransactionCreateManyInput[],
        failures: { count: number; firstError: string },
    ): Promise<number> {
        try {
            await this.prisma.transaction.createMany({ data: rows });
            this.logger.log(`Inserted batch of ${rows.length} transactions`);
            return rows.length;
        } catch (batchError) {
            this.logger.warn(`Batch insert of ${rows.length} failed, retrying row by row: ${errorReason(batchError)}`);
        }

        let inserted = 0;
        for (const row of rows) {
            try {
                await this.prisma.transaction.create({ data: row });
                inserted++;
            } catch (rowError) {
                failures.count++;
                if (!failures.firstError) failures.firstError = errorReason(rowError);
            }
        }
        this.logger.warn(`Row-by-row retry saved ${inserted} of ${rows.length} transactions`);
        return inserted;
    }
}

/** Prisma errors echo the whole query (row values included) before the reason; keep only the reason. */
function errorReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lines = message.split("\n").filter((line) => line.trim() !== "");
    return (lines[lines.length - 1] ?? "Unknown error").trim().slice(0, MAX_ERROR_LENGTH);
}
