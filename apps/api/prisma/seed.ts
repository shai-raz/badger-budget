import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "./seed-demo";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Starting database seed...");

    // Seed Currencies
    console.log("📊 Seeding currencies...");
    const currencies = [
        { code: "USD", symbol: "$", name: "US Dollar", decimalPlaces: 2 },
        { code: "EUR", symbol: "€", name: "Euro", decimalPlaces: 2 },
        { code: "ILS", symbol: "₪", name: "Israeli Shekel", decimalPlaces: 2 },
    ];

    for (const currency of currencies) {
        await prisma.currency.upsert({
            where: { code: currency.code },
            update: currency,
            create: currency,
        });
    }
    console.log("✅ Currencies seeded");

    // Seed Card Payoff Patterns
    console.log("💳 Seeding card payoff patterns...");
    const cardPayoffPatterns = [{ description: "מקס איט פי חיוב" }, { description: "כ.א.ל חיוב" }];

    for (const pattern of cardPayoffPatterns) {
        const exists = await prisma.cardPayoffPattern.findFirst({
            where: { description: pattern.description, isSystem: true },
        });

        if (!exists) {
            await prisma.cardPayoffPattern.create({
                data: {
                    ...pattern,
                    isSystem: true,
                    userId: null,
                },
            });
        }
    }
    console.log("✅ Card payoff patterns seeded");

    // Seed Cash Withdrawal Patterns
    console.log("🏧 Seeding cash withdrawal patterns...");
    const cashWithdrawalPattern = {
        matchField: "additionalDescription",
        text: "משיכת מזומן", // keep in sync with CASH_WITHDRAWAL_LABEL in @badger/shared-data
    };
    const cashPatternExists = await prisma.cashWithdrawalPattern.findFirst({
        where: { ...cashWithdrawalPattern, isSystem: true },
    });
    if (!cashPatternExists) {
        await prisma.cashWithdrawalPattern.create({
            data: { ...cashWithdrawalPattern, isSystem: true, userId: null },
        });
    }
    console.log("✅ Cash withdrawal patterns seeded");

    // Seed System Categories
    // console.log("📁 Seeding system categories...");
    // const systemCategories = [
    //     { name: "Groceries", color: "#10B981", icon: "shopping-cart" },
    //     { name: "Charity", color: "#8B5CF6", icon: "hand-heart" },
    //     { name: "Electronics", color: "#3B82F6", icon: "laptop" },
    //     { name: "Bills", color: "#EF4444", icon: "receipt" },
    //     { name: "Tuition Fees", color: "#F97316", icon: "graduation-cap" },
    //     { name: "Gifts", color: "#EC4899", icon: "gift" },
    //     { name: "Furniture & Home", color: "#92400E", icon: "sofa" },
    //     { name: "Car & Gas", color: "#475569", icon: "car" },
    //     { name: "Transportation", color: "#06B6D4", icon: "bus" },
    //     { name: "Clothing", color: "#7C3AED", icon: "shirt" },
    //     { name: "Government Services", color: "#4F46E5", icon: "landmark" },
    //     { name: "Healthcare", color: "#DB2777", icon: "hospital" },
    //     { name: "Cosmetics", color: "#D946EF", icon: "spray-can" },
    //     { name: "Insurance", color: "#0891B2", icon: "shield" },
    //     { name: "Coffee & Snacks", color: "#78350F", icon: "coffee" },
    //     { name: "Restaurants", color: "#DC2626", icon: "utensils" },
    //     { name: "Unknown", color: "#9CA3AF", icon: "circle-help" },
    //     { name: "Telecom", color: "#4F46E5", icon: "smartphone" },
    //     { name: "Shopping", color: "#7C3AED", icon: "shopping-bag" },
    //     { name: "Entertainment", color: "#A855F7", icon: "film" },
    // ];

    // for (const category of systemCategories) {
    //     const exists = await prisma.category.findFirst({
    //         where: { name: category.name, isSystem: true },
    //     });

    //     if (!exists) {
    //         await prisma.category.create({
    //             data: {
    //                 ...category,
    //                 isSystem: true,
    //                 userId: null,
    //             },
    //         });
    //     }
    // }

    // console.log("✅ System categories seeded");

    // Demo account data is opt-in: set SEED_DEMO=true (the dev .env template does; production defaults to off).
    if (process.env.SEED_DEMO === "true") {
        await seedDemoData(prisma);
    } else {
        console.log("ℹ️ Skipping demo data (set SEED_DEMO=true to seed the demo account)");
    }

    console.log("🎉 Database seed completed successfully!");
}

main()
    .catch((e) => {
        console.error("❌ Error seeding database:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
