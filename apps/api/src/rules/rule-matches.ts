import type { Prisma } from "@prisma/client";
import { isTransactionType, RULE_PREVIEW_PAGE_SIZE } from "@badger/shared-data";
import type { RuleApplyMode, RulePreviewFilter } from "@badger/shared-data";
import type { RuleDraft } from "@badger/types";
import { ruleCategoryId, ruleMatches } from "@badger/utils";
import type { MatchableRule, RuleTransaction } from "@badger/utils";
import type { PrismaService } from "../prisma/prisma.service";

/** A transaction a rule can match, with the fields preview and apply need for ordering and writes. */
export interface RuleCandidate extends RuleTransaction {
    id: string;
    categoryId: string | null;
    transactionDate: Date;
    createdAt: Date;
}

export interface RulePartition {
    /** The category the draft sets, or null when it sets none. */
    target: string | null;
    matched: RuleCandidate[];
    /** Matched rows whose category differs from the target. */
    wouldChange: RuleCandidate[];
    /** Matched rows already in the target category. */
    alreadyTarget: RuleCandidate[];
}

export interface ApplySelection {
    mode: RuleApplyMode;
    ids: string[];
}

/**
 * Loads the user's transactions that rules run against: live rows, mirrors of linked transfers excluded.
 * Hidden rows are included. Rows whose stored type is not a transaction type are skipped.
 */
export async function loadRuleCandidates(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
): Promise<RuleCandidate[]> {
    const rows = await db.transaction.findMany({
        where: { userId, deletedAt: null, counterpartOfId: null },
        select: {
            id: true,
            description: true,
            originalCategory: true,
            amount: true,
            accountId: true,
            type: true,
            categoryId: true,
            transactionDate: true,
            createdAt: true,
        },
    });

    return rows.flatMap((row) =>
        isTransactionType(row.type)
            ? [
                  {
                      id: row.id,
                      description: row.description,
                      originalCategory: row.originalCategory,
                      amount: Number(row.amount),
                      accountId: row.accountId,
                      type: row.type,
                      categoryId: row.categoryId,
                      transactionDate: row.transactionDate,
                      createdAt: row.createdAt,
                  },
              ]
            : [],
    );
}

/** Splits the candidates a draft matches into rows it would change and rows already in its target category. */
export function partitionMatches(candidates: RuleCandidate[], draft: RuleDraft): RulePartition {
    const rule: MatchableRule = {
        id: "draft",
        stopOnMatch: false,
        conditions: draft.conditions,
        actions: draft.actions,
    };
    const target = ruleCategoryId(rule);
    const matched = candidates.filter((candidate) => ruleMatches(candidate, rule));
    const wouldChange = matched.filter((candidate) => candidate.categoryId !== target);
    const alreadyTarget = matched.filter((candidate) => candidate.categoryId === target);
    return { target, matched, wouldChange, alreadyTarget };
}

/** Keeps the would-change ids the selection covers: all except the listed ids, or only the listed ids. */
export function selectApplyIds(wouldChangeIds: string[], selection: ApplySelection): string[] {
    const listed = new Set(selection.ids);
    return selection.mode === "allExcept"
        ? wouldChangeIds.filter((id) => !listed.has(id))
        : wouldChangeIds.filter((id) => listed.has(id));
}

/** True when a candidate passes a preview filter. */
export function matchesPreviewFilter(candidate: RuleCandidate, filter: RulePreviewFilter): boolean {
    switch (filter) {
        case "all":
            return true;
        case "uncategorized":
            return candidate.categoryId === null;
        case "categorized":
            return candidate.categoryId !== null;
    }
}

/** Newest first: transaction date, then creation time, then id. */
export function comparePreviewOrder(a: RuleCandidate, b: RuleCandidate): number {
    return (
        b.transactionDate.getTime() - a.transactionDate.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    );
}

/** Number of pages a preview of `total` rows has. Always at least one, so an empty preview still shows page 1. */
export function previewTotalPages(total: number): number {
    return Math.max(1, Math.ceil(total / RULE_PREVIEW_PAGE_SIZE));
}

/**
 * Sets the category of the selected would-change transactions in one updateMany. Ids are always taken from the
 * would-change set, so a selection can never touch a row the draft does not change. Returns the number updated.
 */
export async function applyRuleSelection(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    draft: RuleDraft,
    selection: ApplySelection,
): Promise<number> {
    const { target, wouldChange } = partitionMatches(await loadRuleCandidates(db, userId), draft);
    const ids = selectApplyIds(
        wouldChange.map((candidate) => candidate.id),
        selection,
    );
    if (ids.length === 0) return 0;

    const result = await db.transaction.updateMany({
        where: { id: { in: ids }, userId },
        data: { categoryId: target },
    });
    return result.count;
}
