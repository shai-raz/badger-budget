import { Decimal } from "@prisma/client/runtime/library";

/**
 * Decides which import candidates are already stored.
 *
 * A provider's `externalId` is not unique: installments share one (Visa Cal, Isracard), and bank
 * reference numbers repeat (a monthly salary or standing order). Content alone is not unique either:
 * two identical purchases on one day are two transactions. So a candidate counts as stored only when
 * it can be paired with a stored row no other candidate has claimed.
 */

export interface DedupCandidate {
    externalId: string;
    /** Undefined when the candidate's account doesn't exist yet (it has no stored rows). */
    accountId: string | undefined;
    transactionDate: Date;
    /** See ImportCandidate.legacyTransactionDate. */
    legacyTransactionDate?: Date;
    amount: number;
    description: string;
}

export interface StoredRow {
    id: string;
    accountId: string;
    externalId: string | null;
    transactionDate: Date;
    postedDate: Date | null;
    amount: Decimal | number | string;
    description: string;
    deletedAt: Date | null;
    /** The row's account is soft-deleted (its transactions stay stored). */
    accountDeleted: boolean;
}

/**
 * Strongest first. Each tier runs over every candidate before the next starts, so a weaker tier can't
 * take a stored row that a stronger one needs. All but `lookAlike` require the same externalId.
 *
 * - identical: same account, day, amount and description. Keeps a repeated import a no-op.
 * - sameDay: same account and day (a bank may change the amount when a pending row settles).
 * - legacyDate: same account, stored on the day-early date bank-sync used to write.
 * - otherAccount: a deleted account, same day and amount. Deleting an account keeps its transactions, and
 *   the next sync re-creates the account, so without this its rows would all be imported again. Two live
 *   accounts never match: a transaction can't move between accounts.
 * - nearDate: same account, within NEAR_DATE_DAYS (the bank or sheet shifted the date).
 * - lookAlike: a different externalId; same account, day, amount and description (a row whose id the
 *   provider changed). Never a row with no externalId: those were added by hand, and a visible duplicate
 *   beats a bank row that silently never arrives.
 */
export const DEDUP_TIERS = ["identical", "sameDay", "legacyDate", "otherAccount", "nearDate", "lookAlike"] as const;
export type DedupTier = (typeof DEDUP_TIERS)[number];

export interface DedupMatch {
    row: StoredRow;
    tier: DedupTier;
}

/** Installments and monthly charges sit about a month apart, so this can't pair two of them. */
export const NEAR_DATE_DAYS = 3;

const MS_PER_DAY = 86_400_000;
/** UTC day number: `@db.Date` values and import candidates are both UTC midnight of the calendar day. */
const dayOf = (date: Date): number => Math.floor(date.getTime() / MS_PER_DAY);

/** The description the importer stores for a candidate. */
export const storedDescription = (description: string): string => description || "Imported";

/** Postgres rounds to the column's 2 decimals on insert, so same-row checks compare rounded. */
const sameStoredAmount = (candidate: number, stored: StoredRow["amount"]): boolean =>
    new Decimal(candidate).toDecimalPlaces(2).equals(stored);

type Finder = (candidate: DedupCandidate, free: (row: StoredRow) => boolean) => StoredRow | undefined;

/**
 * Pairs each candidate with at most one stored row, and each stored row with at most one candidate.
 * Returns one entry per candidate, in order: the match, or null when the candidate is new.
 */
export function matchStoredRows(candidates: DedupCandidate[], storedRows: StoredRow[]): (DedupMatch | null)[] {
    const byExternalId = new Map<string, StoredRow[]>();
    const byLookAlike = new Map<string, StoredRow[]>();
    const lookAlikeKey = (accountId: string, day: number, description: string) =>
        `${accountId}\u0000${day}\u0000${description}`;

    // A fixed row order (the query has none) keeps the pairing the same from one import to the next.
    for (const row of [...storedRows].sort((a, b) => compare(a.id, b.id))) {
        if (row.externalId !== null) push(byExternalId, row.externalId, row);
        if (row.externalId !== null && !row.deletedAt) {
            push(byLookAlike, lookAlikeKey(row.accountId, dayOf(row.transactionDate), row.description), row);
        }
    }

    const sameId = (c: DedupCandidate) => byExternalId.get(c.externalId) ?? [];
    const legacyDay = (c: DedupCandidate) => (c.legacyTransactionDate ? dayOf(c.legacyTransactionDate) : undefined);

    const finders: Record<DedupTier, Finder> = {
        identical: (c, free) =>
            sameId(c).find(
                (r) =>
                    free(r) &&
                    r.accountId === c.accountId &&
                    dayOf(r.transactionDate) === dayOf(c.transactionDate) &&
                    r.description === storedDescription(c.description) &&
                    sameStoredAmount(c.amount, r.amount),
            ),
        sameDay: (c, free) =>
            sameId(c).find(
                (r) => free(r) && r.accountId === c.accountId && dayOf(r.transactionDate) === dayOf(c.transactionDate),
            ),
        legacyDate: (c, free) => {
            const legacy = legacyDay(c);
            if (legacy === undefined) return undefined;
            return sameId(c).find((r) => free(r) && r.accountId === c.accountId && dayOf(r.transactionDate) === legacy);
        },
        otherAccount: (c, free) => {
            const days = [dayOf(c.transactionDate), legacyDay(c)];
            return sameId(c).find(
                (r) =>
                    free(r) &&
                    r.accountDeleted &&
                    r.accountId !== c.accountId &&
                    days.includes(dayOf(r.transactionDate)) &&
                    sameStoredAmount(c.amount, r.amount),
            );
        },
        nearDate: (c, free) => {
            let best: StoredRow | undefined;
            let bestDistance = NEAR_DATE_DAYS + 1;
            for (const r of sameId(c)) {
                if (!free(r) || r.accountId !== c.accountId) continue;
                const distance = Math.abs(dayOf(r.transactionDate) - dayOf(c.transactionDate));
                if (distance < bestDistance) {
                    best = r;
                    bestDistance = distance;
                }
            }
            return best;
        },
        lookAlike: (c, free) => {
            if (c.accountId === undefined) return undefined;
            const rows = byLookAlike.get(lookAlikeKey(c.accountId, dayOf(c.transactionDate), c.description));
            // Exact amount, not rounded: this tier must never skip a row the old per-row query kept.
            return rows?.find((r) => free(r) && new Decimal(c.amount).equals(r.amount));
        },
    };

    // Candidates that look the same are visited together, whatever order the provider returned them in.
    // Without this, importing the same rows again could pair them differently and insert one twice.
    const sortKeys = candidates.map((c) =>
        [
            c.externalId,
            c.accountId ?? "",
            dayOf(c.transactionDate),
            legacyDay(c) ?? "",
            new Decimal(c.amount).toDecimalPlaces(2).toString(),
            storedDescription(c.description),
        ].join("\u0000"),
    );
    const order = candidates.map((_, i) => i).sort((a, b) => compare(sortKeys[a], sortKeys[b]) || a - b);

    const matches: (DedupMatch | null)[] = candidates.map(() => null);
    const taken = new Set<string>();
    const free = (row: StoredRow) => !taken.has(row.id);

    for (const tier of DEDUP_TIERS) {
        for (const i of order) {
            if (matches[i]) continue;
            const row = finders[tier](candidates[i], free);
            if (!row) continue;
            taken.add(row.id);
            matches[i] = { row, tier };
        }
    }

    return matches;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}
