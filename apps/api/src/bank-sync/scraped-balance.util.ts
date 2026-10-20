export interface ScrapedAccountBalance {
    accountNumber: string;
    /** Guaranteed finite. Negative for overdrafts and for card debt (IBS negates card balances). */
    amount: number;
    /** IBS `balanceDate` — the next debit date (cal) or cycle date (max). Null when absent/unparseable. */
    balanceDate: Date | null;
    /** IBS `savingsAccount === true`. Leumi returns these with `txns: []`, so balance is their only data. */
    isSavings: boolean;
    /**
     * IBS `cardFrame` — the card's credit limit. Card providers only; null for banks, and null for
     * a non-positive frame (Isracard reports `0` for a cancelled card, which isn't a real limit).
     * Never sum this across accounts: Cal's frame is group-level, shared by every card in the
     * issuing agreement.
     */
    cardFrame: number | null;
    /**
     * IBS `cardType`. Cal-only in practice; null when absent, not one of the two known values, or a
     * frame-less `companyIssued` (see `parseCardIssuer`).
     */
    cardIssuer: "bankIssued" | "companyIssued" | null;
}

/**
 * Pulls balances out of a raw `israeli-bank-scrapers` `result.accounts` array.
 *
 * Kept separate from `ScraperService` so it can be unit tested without puppeteer, and typed as
 * `unknown[]` because the IBS account shape varies by provider and version — everything here is
 * defensive by design.
 *
 * Note that a missing balance is normal, not an error: union and yahav never set one. Non-finite
 * values are also reachable — mizrahi computes `+fields?.Yitra` (`NaN` when the field is absent)
 * and the DOM-scraping providers use `parseFloat` — so those are dropped rather than persisted as
 * garbage.
 *
 * `companyId` is only consulted for the isracard date roll-forward below; everything else is
 * provider-agnostic.
 */
export function extractAccountBalances(accounts: unknown[], companyId?: string): ScrapedAccountBalance[] {
    const balances: ScrapedAccountBalance[] = [];

    for (const raw of accounts) {
        if (!raw || typeof raw !== "object") continue;
        const account = raw as Record<string, unknown>;

        const accountNumber = account.accountNumber;
        if (typeof accountNumber !== "string" || accountNumber === "") continue;

        // Absent balance is expected for several providers — skip quietly.
        //
        // Deliberately above the cardFrame extraction: an account with a frame but no balance is
        // dropped whole. `account_balance_snapshots.amount` is NOT NULL, so emitting a frame-only
        // row would mean making it nullable, which changes what a snapshot *is*. Unreachable
        // today — all four frame-reporting providers also report a balance.
        const amount = account.balance;
        if (typeof amount !== "number" || !Number.isFinite(amount)) continue;

        const cardFrame = parseCardFrame(account.cardFrame);

        balances.push({
            accountNumber,
            amount,
            balanceDate: rollForwardStaleYear(parseBalanceDate(account.balanceDate), companyId),
            isSavings: account.savingsAccount === true,
            cardFrame,
            cardIssuer: parseCardIssuer(account.cardType, cardFrame),
        });
    }

    return balances;
}

// Matches a leading `YYYY-MM-DD` so the calendar day can be taken literally off the string,
// regardless of what time-of-day or timezone designator (if any) follows it.
const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `balance_date` is `@db.Date`, and Prisma writes those columns from the value's UTC components.
 * A `Date` produced by a local-timezone parse therefore lands on the wrong calendar day for any
 * UTC+ server — `max` supplies `balanceDate` as an opaque string off its `CycleSummary` API, which
 * can arrive with no timezone designator (`"2026-10-02T00:00:00"`), so `new Date(...)` would parse
 * it in server-local time. This normalizes every result to UTC midnight instead, matching the
 * repo's convention for date-only values (see `transactionDate` and `report-period.util.ts`).
 */
function parseBalanceDate(value: unknown): Date | null {
    if (typeof value !== "string" && !(value instanceof Date)) return null;

    if (typeof value === "string") {
        const match = DATE_ONLY_PREFIX.exec(value);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const utc = new Date(Date.UTC(year, month - 1, day));
            // Date.UTC silently rolls overflowing components into a later month/year rather than
            // rejecting them, so confirm the round-trip matches instead of trusting the input.
            const isValid =
                utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
            return isValid ? utc : null;
        }
    }

    // Either a string that doesn't start with a plain date (fall back to a permissive parse), or a
    // `Date` instance. A `Date` carries its intended calendar day in its *local* components if it
    // came from a local-timezone parse upstream, so read those rather than the UTC ones.
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

/**
 * A `cardFrame` is only a credit limit when it's positive. Isracard reports `0` for a cancelled
 * card, and a negative frame is nonsense — both become null rather than being stored as a limit.
 */
function parseCardFrame(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
    return value;
}

/**
 * IBS only sets `bankIssued` when it actually matched the card in `bankIssuedCards.cardLevelFrames`,
 * so it's a real observation. `companyIssued` isn't: Cal's scraper sets it in the unconditional
 * `else` branch, fired whenever the bank-issued match fails — including when the card is missing
 * from the `/frames` response entirely. A `companyIssued` with no frame is therefore more likely a
 * dropped card than a genuine company-issued one, so it's suppressed rather than stored.
 *
 * This is a heuristic, not a complete guard: IBS's `cardFrame` is the *group*-level
 * `frameLimitForCardAmount`, not per-card, so a card absent from `cardLevelFrames` while its group
 * still resolves keeps a non-null frame and slips through anyway.
 */
function parseCardIssuer(value: unknown, cardFrame: number | null): "bankIssued" | "companyIssued" | null {
    if (cardFrame === null && value === "companyIssued") return null;
    return value === "bankIssued" || value === "companyIssued" ? value : null;
}

// A parsed balanceDate this far in the past is taken as a year-less date that moment stamped with
// the wrong year, rather than a genuinely old charge date.
const STALE_MONTHS = 3;

/**
 * Isracard's balance date comes from a `לחיוב ב-DD/MM` label with no year, so moment fills in the
 * current one: a December scrape of a January charge date lands ~11 months in the past. Add a year
 * when the result is clearly stale.
 *
 * Scoped to isracard on purpose — amex's date carries a real year and is legitimately a few weeks
 * old, so a global guard would misfire. This can be retired once IBS parses the year upstream.
 */
function rollForwardStaleYear(date: Date | null, companyId?: string): Date | null {
    if (date === null || companyId !== "isracard") return date;

    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - STALE_MONTHS);
    if (date.getTime() >= threshold.getTime()) return date;

    return new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
}
