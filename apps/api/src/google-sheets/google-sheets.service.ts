import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { sheets as sheetsClient, sheets_v4 } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { ConfigService } from "@nestjs/config";
import { SyncResultDto } from "./dto";
import { Decimal } from "@prisma/client/runtime/library";
import { findMatchingCategoryId } from "@badger/utils";
import { TransactionImportService, ImportCandidate } from "../transactions/transaction-import.service";

interface SheetRow {
    date: string;
    amount: string;
    description: string;
    additionalDescription: string;
    category: string;
    accountNumber: string;
    hash: string; // Ignore this
    currency: string;
    originalAmount: string; // Ignore this
    chargeDate: string;
    id: string; // Use as externalId
    type: string; // normal/installments
    status: string; // Ignore this
}

@Injectable()
export class GoogleSheetsService {
    private readonly logger = new Logger(GoogleSheetsService.name);
    private readonly sheets: sheets_v4.Sheets;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private cardPayoffPatternsService: CardPayoffPatternsService,
        private transactionImportService: TransactionImportService,
    ) {
        // Initialize Google Sheets API client with service account
        const auth = new GoogleAuth({
            credentials: {
                type: this.configService.get("GOOGLE_SHEETS_TYPE"),
                project_id: this.configService.get("GOOGLE_SHEETS_PROJECT_ID"),
                private_key_id: this.configService.get("GOOGLE_SHEETS_PRIVATE_KEY_ID"),
                private_key: this.configService.get("GOOGLE_SHEETS_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
                client_email: this.configService.get("GOOGLE_SHEETS_CLIENT_EMAIL"),
                client_id: this.configService.get("GOOGLE_SHEETS_CLIENT_ID"),
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
        });

        this.sheets = sheetsClient({ version: "v4", auth });
    }

    async connectSheet(userId: string, spreadsheetId: string, sheetName: string = "Sheet1") {
        // Test access to the sheet
        try {
            await this.testSheetAccess(spreadsheetId, sheetName);
        } catch (error) {
            throw new BadRequestException(
                "Cannot access the sheet. Make sure it is shared with: " +
                    this.configService.get("GOOGLE_SHEETS_CLIENT_EMAIL"),
            );
        }

        // Check if connection already exists
        const existing = await this.prisma.sheetConnection.findFirst({
            where: { userId, isActive: true },
        });

        if (existing) {
            // Update existing connection
            return this.prisma.sheetConnection.update({
                where: { id: existing.id },
                data: { spreadsheetId, sheetName, updatedAt: new Date() },
            });
        }

        // Create new connection
        return this.prisma.sheetConnection.create({
            data: {
                userId,
                spreadsheetId,
                sheetName,
            },
        });
    }

    async getConnection(userId: string) {
        const connection = await this.prisma.sheetConnection.findFirst({
            where: { userId, isActive: true },
        });

        if (!connection) {
            throw new NotFoundException("No active sheet connection found");
        }

        return connection;
    }

    async disconnectSheet(userId: string) {
        const connection = await this.getConnection(userId);

        return this.prisma.sheetConnection.update({
            where: { id: connection.id },
            data: { isActive: false },
        });
    }

    private async testSheetAccess(spreadsheetId: string, sheetName: string) {
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A1:A1`,
        });

        return response.data;
    }

    private async readSheetData(spreadsheetId: string, sheetName: string): Promise<string[][]> {
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:M`, // Columns A through M (13 columns)
        });

        return response.data.values || [];
    }

    async syncTransactions(userId: string, defaultCurrencyCode?: string): Promise<SyncResultDto> {
        const earlyResult: SyncResultDto = {
            success: false,
            transactionsSynced: 0,
            categoriesCreated: 0,
            accountsCreated: 0,
            rowsSkipped: 0,
            warnings: [],
            syncedAt: new Date(),
        };

        try {
            // Get connection
            const connection = await this.getConnection(userId);

            this.logger.log(`Starting sync for user ${userId}, sheet ${connection.spreadsheetId}`);

            // Read all rows from sheet
            const rows = await this.readSheetData(connection.spreadsheetId, connection.sheetName);

            if (rows.length === 0) {
                earlyResult.success = true;
                earlyResult.warnings.push("Sheet is empty");
                return earlyResult;
            }

            // Skip header row (first row)
            const dataRows = rows.slice(1);

            this.logger.log(`Found ${dataRows.length} data rows to process`);

            // Map sheet rows → ImportCandidate[]
            const candidates: ImportCandidate[] = [];
            let rowsSkipped = 0;
            const rowWarnings: string[] = [];

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];

                if (row.length < 11) {
                    rowsSkipped++;
                    rowWarnings.push(`Row ${i + 2}: Insufficient columns`);
                    continue;
                }

                const rowData: SheetRow = {
                    date: row[0] || "",
                    amount: row[1] || "",
                    description: row[2] || "",
                    additionalDescription: row[3] || "",
                    category: row[4] || "",
                    accountNumber: row[5] || "",
                    hash: row[6] || "",
                    currency: row[7] || "",
                    originalAmount: row[8] || "",
                    chargeDate: row[9] || "",
                    id: row[10] || "",
                    type: row[11] || "",
                    status: row[12] || "",
                };

                if (!rowData.id) {
                    rowsSkipped++;
                    rowWarnings.push(`Row ${i + 2}: Missing ID`);
                    continue;
                }

                const amount = parseFloat(rowData.amount.replace(/[,]/g, ""));
                if (isNaN(amount)) {
                    rowsSkipped++;
                    rowWarnings.push(`Row ${i + 2}: Invalid amount`);
                    continue;
                }

                const transactionDate = this.parseDate(rowData.date);
                if (!transactionDate) {
                    rowsSkipped++;
                    rowWarnings.push(`Row ${i + 2}: Invalid date format`);
                    continue;
                }

                const postedDate = rowData.chargeDate ? this.parseDate(rowData.chargeDate) : null;

                // Parse original amount from col I
                let parsedOriginalAmount: number | null = null;
                if (rowData.originalAmount) {
                    const rawOriginal = parseFloat(rowData.originalAmount.replace(/[,]/g, ""));
                    if (!isNaN(rawOriginal)) {
                        parsedOriginalAmount = Math.abs(rawOriginal);
                    }
                }

                candidates.push({
                    externalId: rowData.id,
                    accountNumber: rowData.accountNumber,
                    transactionDate,
                    postedDate,
                    amount: Math.abs(amount),
                    signedAmount: amount,
                    chargedCurrencyCode: rowData.currency,
                    originalAmount: parsedOriginalAmount,
                    originalCurrencyCode: rowData.currency, // same field; import service handles same-currency logic
                    description: rowData.description,
                    additionalDescription: rowData.additionalDescription || null,
                    originalCategory: rowData.category || null,
                    paymentType: rowData.type || null,
                });
            }

            // Delegate to shared import service
            const importResult = await this.transactionImportService.importTransactions(
                userId,
                candidates,
                defaultCurrencyCode,
            );

            // Merge row-level skip warnings from sheet parsing
            importResult.rowsSkipped += rowsSkipped;
            importResult.warnings = [...rowWarnings, ...importResult.warnings];

            // Update last synced timestamp
            await this.prisma.sheetConnection.update({
                where: { id: connection.id },
                data: { lastSyncedAt: importResult.syncedAt },
            });

            this.logger.log(
                `Sync completed: ${importResult.transactionsSynced} transactions, ${importResult.categoriesCreated} categories, ${importResult.accountsCreated} accounts`,
            );

            return importResult;
        } catch (error) {
            this.logger.error("Sync failed", error);
            earlyResult.success = false;
            earlyResult.error = (error as Error).message || "Unknown error occurred";
            return earlyResult;
        }
    }

    /**
     * Resolve the currency to assign to a newly-created account during sync.
     * Priority: explicit defaultCurrencyCode hint (from client locale) → user's most-common account currency
     * → user's most-common transaction currency → USD fallback.
     */
    private async resolveDefaultAccountCurrencyId(
        userId: string,
        currencies: { id: string; code: string }[],
        usdId: string,
        defaultCurrencyCode?: string,
    ): Promise<string> {
        if (defaultCurrencyCode) {
            const match = currencies.find((c) => c.code === defaultCurrencyCode.toUpperCase());
            if (match) return match.id;
        }

        // User's most-common transaction currency as a heuristic
        const topCurrencies = await this.prisma.transaction.groupBy({
            by: ["currencyId"],
            where: { userId, deletedAt: null },
            _count: { currencyId: true },
            orderBy: { _count: { currencyId: "desc" } },
            take: 1,
        });
        if (topCurrencies.length > 0) {
            return topCurrencies[0].currencyId;
        }

        return usdId;
    }

    /**
     * One-time migration for existing users: reads the Google Sheet to recover originalAmount/
     * originalCurrency for historical transactions, and sets each account's currency.
     * No-ops immediately if the user is already backfilled (currencyBackfilledAt is set).
     */
    async backfillCurrenciesOnce(userId: string, defaultCurrencyCode?: string): Promise<{ skipped: boolean }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { currencyBackfilledAt: true },
        });

        if (!user) throw new Error("User not found");
        if (user.currencyBackfilledAt) return { skipped: true };

        const currencies = await this.prisma.currency.findMany();
        const currencyBySymbol = new Map(currencies.map((c) => [c.symbol, c.id]));
        const currencyByCode = new Map(currencies.map((c) => [c.code, c.id]));
        const defaultCurrency = currencies.find((c) => c.code === "USD");
        if (!defaultCurrency) throw new Error("Default USD currency not found");

        const accounts = await this.prisma.account.findMany({
            where: { userId, deletedAt: null },
        });

        // Derive each account's currency from its most-common transaction currency
        for (const account of accounts) {
            if (account.currencyId) continue; // already has one

            const topCurrencies = await this.prisma.transaction.groupBy({
                by: ["currencyId"],
                where: { userId, accountId: account.id, deletedAt: null },
                _count: { currencyId: true },
                orderBy: { _count: { currencyId: "desc" } },
                take: 1,
            });

            let accountCurrencyId: string;
            if (topCurrencies.length > 0) {
                accountCurrencyId = topCurrencies[0].currencyId;
            } else {
                accountCurrencyId = await this.resolveDefaultAccountCurrencyId(
                    userId,
                    currencies,
                    defaultCurrency.id,
                    defaultCurrencyCode,
                );
            }

            await this.prisma.account.update({
                where: { id: account.id },
                data: { currencyId: accountCurrencyId },
            });

            account.currencyId = accountCurrencyId;
        }

        // Build map: accountId → currencyId
        const accountCurrencyMap = new Map(accounts.map((a) => [a.id, a.currencyId as string]));

        // Fetch all existing transactions for this user. Reimbursement-linked rows are skipped so
        // the same-currency invariant of allocations holds (links are same-currency only in v1).
        const existingTransactions = await this.prisma.transaction.findMany({
            where: { userId, deletedAt: null, reimbursedBy: { none: {} }, reimburses: { none: {} } },
            select: { id: true, accountId: true, currencyId: true, externalId: true },
        });

        // Attempt to read sheet data to recover originalAmount (col I) per externalId
        const sheetDataByExternalId = new Map<
            string,
            { originalCurrencyId: string | null; originalAmount: Decimal | null }
        >();
        try {
            const connection = await this.prisma.sheetConnection.findFirst({ where: { userId, isActive: true } });
            if (connection) {
                const rows = await this.readSheetData(connection.spreadsheetId, connection.sheetName);
                const dataRows = rows.slice(1);
                for (const row of dataRows) {
                    if (row.length < 11) continue;
                    const externalId = row[10] || "";
                    if (!externalId) continue;

                    const rawCurrency = row[7] || "";
                    const rawOriginal = row[8] || "";

                    const origCurrId =
                        currencyBySymbol.get(rawCurrency) || currencyByCode.get(rawCurrency.toUpperCase()) || null;
                    let origAmount: Decimal | null = null;
                    if (rawOriginal) {
                        const parsed = parseFloat(rawOriginal.replace(/[,]/g, ""));
                        if (!isNaN(parsed)) origAmount = new Decimal(Math.abs(parsed));
                    }
                    sheetDataByExternalId.set(externalId, {
                        originalCurrencyId: origCurrId,
                        originalAmount: origAmount,
                    });
                }
            }
        } catch {
            // Sheet may not be connected or accessible — continue without original amounts
        }

        // Update transactions in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < existingTransactions.length; i += BATCH_SIZE) {
            const batch = existingTransactions.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map((tx) => {
                    const accountCurrencyId = accountCurrencyMap.get(tx.accountId);
                    if (!accountCurrencyId || tx.currencyId === accountCurrencyId) {
                        // Already correct or account has no currency set — skip
                        return Promise.resolve();
                    }

                    const sheetData = tx.externalId ? sheetDataByExternalId.get(tx.externalId) : null;
                    const hasForeignOriginal =
                        sheetData?.originalCurrencyId !== null &&
                        sheetData?.originalCurrencyId !== accountCurrencyId &&
                        sheetData?.originalAmount !== null;

                    return this.prisma.transaction.update({
                        where: { id: tx.id },
                        data: {
                            currencyId: accountCurrencyId,
                            originalCurrencyId: hasForeignOriginal ? sheetData!.originalCurrencyId : tx.currencyId,
                            originalAmount: hasForeignOriginal ? sheetData!.originalAmount : null,
                        },
                    });
                }),
            );
        }

        // Stamp the user as backfilled
        await this.prisma.user.update({
            where: { id: userId },
            data: { currencyBackfilledAt: new Date() },
        });

        return { skipped: false };
    }

    private parseDate(dateStr: string): Date | null {
        if (!dateStr) return null;

        // Try parsing common date formats
        // Format: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY
        const formats = [
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
            /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
        ];

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (format.source.startsWith("^(\\d{4})")) {
                    // YYYY-MM-DD
                    const date = new Date(`${match[1]}-${match[2]}-${match[3]}`);
                    if (!isNaN(date.getTime())) return date;
                } else {
                    // DD/MM/YYYY - assume day/month/year
                    const date = new Date(`${match[3]}-${match[2]}-${match[1]}`);
                    if (!isNaN(date.getTime())) return date;
                }
            }
        }

        // Try default parsing
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    }

    private async matchCategoryByRules(
        userId: string,
        transactionData: { originalCategory?: string; description?: string; amount?: number },
    ): Promise<string | null> {
        // Get active category mapping rules
        const rules = await this.prisma.categoryMappingRule.findMany({
            where: {
                userId,
                isActive: true,
            },
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
