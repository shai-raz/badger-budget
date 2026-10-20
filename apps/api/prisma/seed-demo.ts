import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import * as bcrypt from "bcrypt";
import {
    DEMO_EMAIL,
    DEMO_BANK_ACCOUNT_NAME,
    DEMO_CARD_ACCOUNT_NAME,
    NEEDS_CATEGORIES,
    WANTS_CATEGORIES,
    SALARY_CATEGORY,
    CatDef,
} from "../src/demo/demo-data.constants";
import { toDateOnly, demoWindowStart } from "../src/demo/demo-dates";
import { generateDemoTransactions, DemoDataContext } from "../src/demo/demo-data.generator";
import { ensureDemoBalanceAccounts, refreshDemoBalances, DemoBalanceAccountIds } from "../src/demo/demo-balances";

const DEMO_PASSWORD = "demo123QWEasd";

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
    console.log("🧪 Seeding development demo data...");

    // Idempotency: skip if the demo user already exists.
    const existing = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
    if (existing) {
        console.log("↩️  Demo data already exists, skipping.");
        return;
    }

    // Deterministic data across runs. This is the only place that seeds faker.
    faker.seed(1234);

    const ils = await prisma.currency.findUnique({ where: { code: "ILS" } });
    if (!ils) {
        throw new Error("ILS currency not found — currencies must be seeded before demo data.");
    }

    // Demo user (password hashed the same way as auth.service.ts).
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await prisma.user.create({
        data: {
            email: DEMO_EMAIL,
            password,
            firstName: "Demo",
            lastName: "User",
            currencyBackfilledAt: new Date(),
        },
    });

    // Accounts.
    const bankAccount = await prisma.account.create({
        data: {
            userId: user.id,
            name: DEMO_BANK_ACCOUNT_NAME,
            type: "bank",
            icon: "landmark",
            color: "#2563EB",
            currencyId: ils.id,
        },
    });
    const creditCard = await prisma.account.create({
        data: {
            userId: user.id,
            name: DEMO_CARD_ACCOUNT_NAME,
            type: "credit_card",
            icon: "credit-card",
            color: "#DC2626",
            currencyId: ils.id,
        },
    });

    // Categories (demo-user-scoped).
    const catId = new Map<string, string>();
    for (const cat of [...NEEDS_CATEGORIES, ...WANTS_CATEGORIES, SALARY_CATEGORY]) {
        const created = await prisma.category.create({
            data: {
                userId: user.id,
                name: cat.name,
                color: cat.color,
                icon: cat.icon,
                isSystem: false,
            },
        });
        catId.set(cat.name, created.id);
    }

    // Budgets (Needs / Wants), each linked to its categories via BudgetCategory.
    const today = toDateOnly(new Date());
    const budgetStart = demoWindowStart(today);

    const createBudget = async (name: string, amount: number, cats: CatDef[]) => {
        const budget = await prisma.budget.create({
            data: {
                userId: user.id,
                name,
                amount,
                currencyId: ils.id,
                period: "monthly",
                startDate: budgetStart,
            },
        });
        await prisma.budgetCategory.createMany({
            data: cats.map((c) => ({ budgetId: budget.id, categoryId: catId.get(c.name)! })),
        });
    };

    await createBudget("Needs", 8000, NEEDS_CATEGORIES);
    await createBudget("Wants", 3000, WANTS_CATEGORIES);

    // ~12 months of transactions, ending today.
    const ctx: DemoDataContext = {
        userId: user.id,
        currencyId: ils.id,
        bankAccountId: bankAccount.id,
        creditCardId: creditCard.id,
        categoryIds: catId,
    };
    const created = await generateDemoTransactions(prisma, ctx, budgetStart, today);

    await prisma.user.update({ where: { id: user.id }, data: { demoDataThrough: today } });

    // The 3 remaining balance-only tiles (savings, Cal card, no-limit card) — same helpers
    // DemoService.topUpIfStale uses on login, so a freshly-seeded demo user shows every balance
    // variant immediately instead of only after the first login's top-up.
    const newBalanceIds = await ensureDemoBalanceAccounts(prisma, user.id, ils.id);
    const balanceIds: DemoBalanceAccountIds = {
        bankAccountId: bankAccount.id,
        creditCardId: creditCard.id,
        ...newBalanceIds,
    };
    await refreshDemoBalances(prisma, user.id, balanceIds, today);

    console.log(
        `✅ Demo data seeded: user ${DEMO_EMAIL}, 5 accounts, ${catId.size} categories, 2 budgets, ${created} transactions.`,
    );
}
