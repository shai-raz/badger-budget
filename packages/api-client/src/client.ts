import axios, { type AxiosInstance, AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
    ITransactionResponse,
    IUpdateTransaction,
    ICreateTransaction,
    ITransactionListParams,
    ITransactionSummaryParams,
    ITransactionsSummaryResponse,
    PaginatedResponse,
    ITransactionAttachmentResponse,
    ICreateTransactionAttachment,
    CreateCategoryMappingRuleDto,
    ICategoryMappingRule,
    DeleteCategoryOptions,
    CategoryUsageResponse,
    ICardPayoffPattern,
    ICashWithdrawalPattern,
    ICreateCardPayoffPattern,
    ISyncPinStatus,
    ISyncPasskey,
    IRegisterSyncPasskey,
    IScraperConnectionResponse,
    ICreateScraperConnection,
    IUpdateScraperConnection,
    ISyncJob,
    SpendingReport,
    IAccountResponse,
    IUpdateLedgerBalance,
    ILedgerBalanceUpdateResponse,
    IOAuthConsentRequest,
    IOAuthDecisionResponse,
    IOAuthConnection,
    IMcpConfig,
    IAppConfigResponse,
    ICreateReimbursementAllocation,
    IUpdateReimbursementAllocation,
    IReimbursementAllocationResponse,
    IReimbursementCandidatesResponse,
    ICardPayoffLinkPreview,
    ISystemInfo,
    IChangelogResponse,
    IChangelogSeenResponse,
} from "@badger/types";
import type { AccountType } from "@badger/shared-data";

export interface ApiClientConfig {
    baseURL: string;
    timeout?: number;
    onAuthRequired?: () => void;
    getAccessToken?: () => Promise<string | null>;
    getRefreshToken?: () => Promise<string | null>;
    setTokens?: (accessToken: string, refreshToken: string) => Promise<void>;
    clearTokens?: () => Promise<void>;
}

export class ApiClient {
    private client: AxiosInstance;
    private config: ApiClientConfig;
    private isRefreshing = false;
    private refreshQueue: Array<(token: string) => void> = [];

    constructor(config: ApiClientConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.baseURL,
            timeout: config.timeout || 30000,
            headers: {
                "Content-Type": "application/json",
            },
        });

        this.setupInterceptors();
    }

    private setupInterceptors() {
        // Request interceptor - add auth token
        this.client.interceptors.request.use(
            async (config: InternalAxiosRequestConfig) => {
                if (this.config.getAccessToken) {
                    const token = await this.config.getAccessToken();
                    if (token && config.headers) {
                        config.headers.Authorization = `Bearer ${token}`;
                    }
                }
                return config;
            },
            (error) => Promise.reject(error),
        );

        // Response interceptor - handle token refresh
        this.client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

                // Don't try to refresh tokens for the token-bootstrap / refresh-loop
                // endpoints (a 401 from these can't be recovered by refreshing, and
                // refreshing /auth/refresh itself would loop). Everything else —
                // including /auth/me — is eligible for the 401 -> refresh -> retry flow.
                const refreshExcludedSuffixes = [
                    "/auth/login",
                    "/auth/register",
                    "/auth/refresh",
                    "/auth/logout",
                    "/auth/google",
                ];
                const url = originalRequest.url ?? "";
                const isRefreshExcluded = refreshExcludedSuffixes.some((suffix) => url.includes(suffix));

                // If 401 and we haven't retried yet, try to refresh token
                if (error.response?.status === 401 && !originalRequest._retry && !isRefreshExcluded) {
                    if (this.isRefreshing) {
                        // Wait for refresh to complete
                        return new Promise((resolve) => {
                            this.refreshQueue.push((token: string) => {
                                if (originalRequest.headers) {
                                    originalRequest.headers.Authorization = `Bearer ${token}`;
                                }
                                resolve(this.client(originalRequest));
                            });
                        });
                    }

                    originalRequest._retry = true;
                    this.isRefreshing = true;

                    try {
                        const refreshToken = await this.config.getRefreshToken?.();
                        if (!refreshToken) {
                            throw new Error("No refresh token available");
                        }

                        const response = await this.client.post("/auth/refresh", { refreshToken });
                        const { accessToken, refreshToken: newRefreshToken } = response.data;

                        // Save new tokens
                        await this.config.setTokens?.(accessToken, newRefreshToken);

                        // Update header for original request
                        if (originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                        }

                        // Retry all queued requests
                        this.refreshQueue.forEach((callback) => callback(accessToken));
                        this.refreshQueue = [];

                        return this.client(originalRequest);
                    } catch (refreshError) {
                        // Refresh failed - clear tokens and notify
                        await this.config.clearTokens?.();
                        this.config.onAuthRequired?.();
                        this.refreshQueue = [];
                        return Promise.reject(refreshError);
                    } finally {
                        this.isRefreshing = false;
                    }
                }

                return Promise.reject(error);
            },
        );
    }

    // Public instance config (no auth)
    async getConfig(): Promise<IAppConfigResponse> {
        const response = await this.client.get<IAppConfigResponse>("/config");
        return response.data;
    }

    // Running version and latest-release info (authenticated)
    async getSystemInfo(): Promise<ISystemInfo> {
        const response = await this.client.get<ISystemInfo>("/system/info");
        return response.data;
    }

    async checkForUpdates(): Promise<ISystemInfo> {
        const response = await this.client.post<ISystemInfo>("/system/check-updates");
        return response.data;
    }

    // Bundled release notes for the What's New dialog (authenticated)
    async getChangelog(): Promise<IChangelogResponse> {
        const response = await this.client.get<IChangelogResponse>("/system/changelog");
        return response.data;
    }

    async markChangelogSeen(): Promise<IChangelogSeenResponse> {
        const response = await this.client.post<IChangelogSeenResponse>("/system/changelog/seen");
        return response.data;
    }

    // Auth endpoints
    async register(data: { email: string; password: string; firstName: string; lastName: string }) {
        const response = await this.client.post("/auth/register", data);
        return response.data;
    }

    async login(data: { email: string; password: string }) {
        const response = await this.client.post("/auth/login", data);
        return response.data;
    }

    async googleAuth(data: { code: string; redirectUri: string; codeVerifier: string }) {
        const response = await this.client.post("/auth/google/mobile", data);
        return response.data;
    }

    async logout(refreshToken: string) {
        await this.client.post("/auth/logout", { refreshToken });
    }

    async getMe() {
        const response = await this.client.get("/auth/me");
        return response.data;
    }

    // Accounts
    async getAccounts(): Promise<IAccountResponse[]> {
        const response = await this.client.get<IAccountResponse[]>("/accounts");
        return response.data;
    }

    async getAccount(id: string): Promise<IAccountResponse> {
        const response = await this.client.get<IAccountResponse>(`/accounts/${id}`);
        return response.data;
    }

    async createAccount(data: {
        name: string;
        accountNumber?: string;
        type: AccountType;
        icon?: string;
        color?: string;
        currencyId?: string;
    }) {
        const response = await this.client.post("/accounts", data);
        return response.data;
    }

    async updateLedgerBalance(id: string, data: IUpdateLedgerBalance): Promise<ILedgerBalanceUpdateResponse> {
        const response = await this.client.post(`/accounts/${id}/balance`, data);
        return response.data;
    }

    async updateAccount(
        id: string,
        data: Partial<{ name: string; type: AccountType; icon: string; color: string; currencyId: string }>,
    ) {
        const response = await this.client.patch(`/accounts/${id}`, data);
        return response.data;
    }

    async deleteAccount(id: string) {
        await this.client.delete(`/accounts/${id}`);
    }

    // Categories
    async getCategories() {
        const response = await this.client.get("/categories");
        return response.data;
    }

    async getCategory(id: string) {
        const response = await this.client.get(`/categories/${id}`);
        return response.data;
    }

    async createCategory(data: { name: string; color: string; icon?: string }) {
        const response = await this.client.post("/categories", data);
        return response.data;
    }

    async updateCategory(id: string, data: Partial<{ name: string; color: string; icon: string }>) {
        const response = await this.client.patch(`/categories/${id}`, data);
        return response.data;
    }

    async deleteCategory(id: string, options?: DeleteCategoryOptions) {
        await this.client.delete(`/categories/${id}`, { data: options });
    }

    async getCategoryUsage(id: string): Promise<CategoryUsageResponse> {
        const response = await this.client.get(`/categories/${id}/usage`);
        return response.data;
    }

    // Budgets
    async getBudgets() {
        const response = await this.client.get("/budgets");
        return response.data;
    }

    async getBudget(id: string) {
        const response = await this.client.get(`/budgets/${id}`);
        return response.data;
    }

    async createBudget(data: {
        name: string;
        amount: number;
        currencyId: string;
        period: "daily" | "weekly" | "monthly" | "yearly";
        startDate: string;
        endDate?: string;
        categoryIds?: string[];
        categoryId?: string;
        accountId?: string;
    }) {
        const response = await this.client.post("/budgets", data);
        return response.data;
    }

    async updateBudget(
        id: string,
        data: Partial<{
            name: string;
            amount: number;
            currencyId: string;
            period: "daily" | "weekly" | "monthly" | "yearly";
            startDate: string;
            endDate: string;
            categoryIds?: string[];
            categoryId: string;
            accountId: string;
        }>,
    ) {
        const response = await this.client.patch(`/budgets/${id}`, data);
        return response.data;
    }

    async deleteBudget(id: string) {
        await this.client.delete(`/budgets/${id}`);
    }

    async getBudgetAnalytics(id: string, params?: { periodOffset?: number }) {
        const response = await this.client.get(`/budgets/${id}/analytics`, {
            params,
        });
        return response.data;
    }

    async getBudgetDashboard(params?: { period?: "daily" | "weekly" | "monthly" | "yearly"; periodOffset?: number }) {
        const response = await this.client.get("/budgets/dashboard/summary", {
            params,
        });
        return response.data;
    }

    // Reports
    async getSpendingReport(params: { startDate: string; endDate: string; currency?: string }) {
        const response = await this.client.get<SpendingReport>("/reports/spending", { params });
        return response.data;
    }

    // Transactions

    /**
     * Serializes client-side list/summary params into the wire query object:
     * joins `categoryIds` into a CSV and omits every empty/undefined param so
     * the API never receives e.g. an empty `categoryIds=` string.
     */
    private serializeTransactionParams(params: ITransactionListParams): Record<string, string | number | boolean> {
        const query: Record<string, string | number | boolean> = {};
        if (params.page !== undefined) query.page = params.page;
        if (params.limit !== undefined) query.limit = params.limit;
        const search = params.search?.trim();
        if (search) query.search = search;
        if (params.type) query.type = params.type;
        if (params.categoryIds && params.categoryIds.length > 0) {
            query.categoryIds = params.categoryIds.join(",");
        }
        if (params.startDate) query.startDate = params.startDate;
        if (params.endDate) query.endDate = params.endDate;
        if (params.includeHidden !== undefined) query.includeHidden = params.includeHidden;
        if (params.sortBy) query.sortBy = params.sortBy;
        if (params.sortOrder) query.sortOrder = params.sortOrder;
        if (params.accountId) query.accountId = params.accountId;
        if (params.categoryId) query.categoryId = params.categoryId;
        if (params.budgetId) query.budgetId = params.budgetId;
        return query;
    }

    /**
     * Legacy unpaginated list. Omitting `page` keeps the API on its backward
     * compatible array shape (no hidden filtering). Prefer
     * {@link getTransactionsPaginated} for the redesigned list.
     */
    async getTransactions(params?: {
        accountId?: string;
        categoryId?: string;
        type?: "income" | "expense" | "transfer";
        startDate?: string;
        endDate?: string;
    }) {
        const response = await this.client.get<ITransactionResponse[]>("/transactions", { params });
        return response.data;
    }

    /**
     * Paginated transaction list. Always sends `page` (default 1) so the API
     * returns the wrapped {@link PaginatedResponse} shape rather than the legacy
     * array.
     */
    async getTransactionsPaginated(params: ITransactionListParams): Promise<PaginatedResponse<ITransactionResponse>> {
        const query = this.serializeTransactionParams({ ...params, page: params.page ?? 1 });
        const response = await this.client.get<PaginatedResponse<ITransactionResponse>>("/transactions", {
            params: query,
        });
        return response.data;
    }

    /**
     * Aggregate totals for the current filters. The param type omits
     * page/limit/sort/includeHidden, so those are never sent.
     */
    async getTransactionsSummary(params: ITransactionSummaryParams): Promise<ITransactionsSummaryResponse> {
        const query = this.serializeTransactionParams(params);
        const response = await this.client.get<ITransactionsSummaryResponse>("/transactions/summary", {
            params: query,
        });
        return response.data;
    }

    async getTransaction(id: string) {
        const response = await this.client.get<ITransactionResponse>(`/transactions/${id}`);
        return response.data;
    }

    async createTransaction(data: ICreateTransaction) {
        const response = await this.client.post<ITransactionResponse>("/transactions", data);
        return response.data;
    }

    async updateTransaction(id: string, data: Partial<IUpdateTransaction>) {
        const response = await this.client.patch(`/transactions/${id}`, data);
        return response.data;
    }

    async deleteTransaction(id: string) {
        await this.client.delete(`/transactions/${id}`);
    }

    async markTransactionAsCardPayoff(id: string, description: string) {
        const response = await this.client.post<{ count: number; linksRemoved: number; pattern: ICardPayoffPattern }>(
            `/transactions/${id}/mark-card-payoff`,
            { description },
        );
        return response.data;
    }

    // Metadata only for now — the file itself is uploaded in a later phase.
    async createTransactionAttachment(transactionId: string, data: ICreateTransactionAttachment) {
        const response = await this.client.post<ITransactionAttachmentResponse>(
            `/transactions/${transactionId}/attachments`,
            data,
        );
        return response.data;
    }

    async deleteTransactionAttachment(transactionId: string, attachmentId: string) {
        await this.client.delete(`/transactions/${transactionId}/attachments/${attachmentId}`);
    }

    // Cash Withdrawal Patterns
    async getCashWithdrawalPatterns(): Promise<ICashWithdrawalPattern[]> {
        const response = await this.client.get<ICashWithdrawalPattern[]>("/cash-withdrawal-patterns");
        return response.data;
    }

    // Card Payoff Patterns
    async getCardPayoffPatterns() {
        const response = await this.client.get<ICardPayoffPattern[]>("/card-payoff-patterns");
        return response.data;
    }

    async getCardPayoffPattern(id: string) {
        const response = await this.client.get<ICardPayoffPattern>(`/card-payoff-patterns/${id}`);
        return response.data;
    }

    async createCardPayoffPattern(data: ICreateCardPayoffPattern) {
        const response = await this.client.post<ICardPayoffPattern>("/card-payoff-patterns", data);
        return response.data;
    }

    async applyAllCardPayoffPatterns() {
        const response = await this.client.post<{ count: number; linksRemoved: number }>(
            "/card-payoff-patterns/apply-all",
        );
        return response.data;
    }

    async getCardPayoffLinkPreview(description: string) {
        const response = await this.client.get<ICardPayoffLinkPreview>("/card-payoff-patterns/link-preview", {
            params: { description },
        });
        return response.data;
    }

    async getApplyAllCardPayoffLinkPreview() {
        const response = await this.client.get<ICardPayoffLinkPreview>("/card-payoff-patterns/apply-all/link-preview");
        return response.data;
    }

    async deleteCardPayoffPattern(id: string) {
        await this.client.delete(`/card-payoff-patterns/${id}`);
    }

    // Reimbursements
    async createReimbursement(data: ICreateReimbursementAllocation) {
        const response = await this.client.post<IReimbursementAllocationResponse>("/reimbursements", data);
        return response.data;
    }

    async updateReimbursement(id: string, data: IUpdateReimbursementAllocation) {
        const response = await this.client.patch<IReimbursementAllocationResponse>(`/reimbursements/${id}`, data);
        return response.data;
    }

    async deleteReimbursement(id: string) {
        await this.client.delete(`/reimbursements/${id}`);
    }

    async getReimbursementCandidates(transactionId: string, search?: string) {
        const term = search?.trim();
        const response = await this.client.get<IReimbursementCandidatesResponse>("/reimbursements/candidates", {
            params: term ? { transactionId, search: term } : { transactionId },
        });
        return response.data;
    }

    // Currencies
    async getCurrencies() {
        const response = await this.client.get("/currencies");
        return response.data;
    }

    async getCurrency(id: string) {
        const response = await this.client.get(`/currencies/${id}`);
        return response.data;
    }

    async getCurrencyByCode(code: string) {
        const response = await this.client.get(`/currencies/code/${code}`);
        return response.data;
    }

    // Category mapping rules
    async getCategoryMappingRules() {
        const response = await this.client.get("/category-mapping-rules");
        return response.data;
    }

    async getCategoryMappingRule(id: string) {
        const response = await this.client.get(`/category-mapping-rules/${id}`);
        return response.data;
    }

    async createCategoryMappingRule(data: CreateCategoryMappingRuleDto) {
        const response = await this.client.post<ICategoryMappingRule>("/category-mapping-rules", data);
        return response.data;
    }

    async updateCategoryMappingRule(id: string, data: Partial<CreateCategoryMappingRuleDto>) {
        const response = await this.client.patch<ICategoryMappingRule>(`/category-mapping-rules/${id}`, data);
        return response.data;
    }

    async applyCategoryMappingRule(id: string) {
        const response = await this.client.post<{ count: number }>(`/category-mapping-rules/${id}/apply-all`);
        return response.data;
    }

    async deleteCategoryMappingRule(id: string) {
        await this.client.delete(`/category-mapping-rules/${id}`);
    }

    // Google Sheets
    async connectGoogleSheet(data: { spreadsheetId: string; sheetName?: string }) {
        const response = await this.client.post("/google-sheets/connect", data);
        return response.data;
    }

    async getSheetConnectionStatus() {
        const response = await this.client.get("/google-sheets/status");
        return response.data;
    }

    async syncGoogleSheet(defaultCurrencyCode?: string) {
        const response = await this.client.post(
            "/google-sheets/sync",
            defaultCurrencyCode ? { defaultCurrencyCode } : {},
        );
        return response.data;
    }

    async backfillCurrencies(defaultCurrencyCode?: string): Promise<{ skipped: boolean }> {
        const response = await this.client.post(
            "/google-sheets/backfill-currencies",
            defaultCurrencyCode ? { defaultCurrencyCode } : {},
        );
        return response.data;
    }

    async disconnectGoogleSheet() {
        const response = await this.client.delete("/google-sheets/disconnect");
        return response.data;
    }

    // Bank Scraping
    async getSyncPinStatus() {
        const response = await this.client.get<ISyncPinStatus>("/bank-sync/pin/status");
        return response.data;
    }

    async setSyncPin(pin: string) {
        const response = await this.client.post("/bank-sync/pin", { pin });
        return response.data;
    }

    async getSyncPasskeys() {
        const response = await this.client.get<ISyncPasskey[]>("/bank-sync/passkeys");
        return response.data;
    }

    async registerSyncPasskey(data: IRegisterSyncPasskey) {
        const response = await this.client.post<ISyncPasskey>("/bank-sync/passkeys", data);
        return response.data;
    }

    async deleteSyncPasskey(id: string) {
        await this.client.delete(`/bank-sync/passkeys/${id}`);
    }

    async getOAuthConsentRequest(id: string) {
        const response = await this.client.get<IOAuthConsentRequest>(`/oauth/requests/${encodeURIComponent(id)}`);
        return response.data;
    }

    async decideOAuthConsentRequest(id: string, approve: boolean) {
        const response = await this.client.post<IOAuthDecisionResponse>(
            `/oauth/requests/${encodeURIComponent(id)}/decision`,
            { approve },
        );
        return response.data;
    }

    async getOAuthConnections() {
        const response = await this.client.get<IOAuthConnection[]>("/oauth/connections");
        return response.data;
    }

    async revokeOAuthConnection(id: string) {
        await this.client.delete(`/oauth/connections/${encodeURIComponent(id)}`);
    }

    async getMcpConfig() {
        const response = await this.client.get<IMcpConfig>("/oauth/mcp-config");
        return response.data;
    }

    async getScraperConnections() {
        const response = await this.client.get<IScraperConnectionResponse[]>("/bank-sync/connections");
        return response.data;
    }

    async createScraperConnection(data: ICreateScraperConnection) {
        const response = await this.client.post<IScraperConnectionResponse>("/bank-sync/connections", data);
        return response.data;
    }

    async updateScraperConnection(id: string, data: IUpdateScraperConnection) {
        const response = await this.client.patch<IScraperConnectionResponse>(`/bank-sync/connections/${id}`, data);
        return response.data;
    }

    async deleteScraperConnection(id: string) {
        await this.client.delete(`/bank-sync/connections/${id}`);
    }

    async triggerSync(pin: string, defaultCurrencyCode?: string) {
        const response = await this.client.post<{ jobId: string }>("/bank-sync/sync", { pin, defaultCurrencyCode });
        return response.data;
    }

    async triggerConnectionSync(connectionId: string, pin: string, defaultCurrencyCode?: string) {
        const response = await this.client.post<{ jobId: string }>(`/bank-sync/connections/${connectionId}/sync`, {
            pin,
            defaultCurrencyCode,
        });
        return response.data;
    }

    async getSyncJob(jobId: string) {
        const response = await this.client.get<ISyncJob>(`/bank-sync/sync/jobs/${jobId}`);
        return response.data;
    }

    async getActiveSyncJob() {
        const response = await this.client.get<ISyncJob | null>("/bank-sync/sync/active");
        return response.data;
    }
}
