import { DEFAULT_CURRENCY_CODE } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";

interface PreloadedCurrencies {
    currencies: { id: string; code: string }[];
    fallbackCurrencyId: string;
}

/**
 * Picks the currency to stamp on an auto-created account.
 *
 * Order of preference: an explicitly requested code, then the user's most-used transaction
 * currency, then `DEFAULT_CURRENCY_CODE` as the final fallback.
 *
 * Shared by `TransactionImportService` (which creates accounts from transaction rows) and
 * `AccountBalanceService` (which creates them from balance-only accounts, e.g. Leumi savings).
 * Callers that already hold the currency list pass it in via `preloaded` so the bulk import path
 * doesn't gain an extra query.
 */
export async function resolveDefaultAccountCurrencyId(
    prisma: PrismaService,
    userId: string,
    defaultCurrencyCode?: string,
    preloaded?: PreloadedCurrencies,
): Promise<string> {
    let currencies = preloaded?.currencies;
    let fallbackCurrencyId = preloaded?.fallbackCurrencyId;

    if (!currencies || !fallbackCurrencyId) {
        currencies = await prisma.currency.findMany({ select: { id: true, code: true } });
        const fallback = currencies.find((c) => c.code === DEFAULT_CURRENCY_CODE);
        if (!fallback) {
            throw new Error(`Default ${DEFAULT_CURRENCY_CODE} currency not found`);
        }
        fallbackCurrencyId = fallback.id;
    }

    if (defaultCurrencyCode) {
        const match = currencies.find((c) => c.code === defaultCurrencyCode.toUpperCase());
        if (match) return match.id;
    }

    const topCurrencies = await prisma.transaction.groupBy({
        by: ["currencyId"],
        where: { userId, deletedAt: null },
        _count: { currencyId: true },
        orderBy: { _count: { currencyId: "desc" } },
        take: 1,
    });
    if (topCurrencies.length > 0) {
        return topCurrencies[0].currencyId;
    }

    return fallbackCurrencyId;
}
