// Plain TS, no Nest DI: this file (and its siblings in src/demo) is imported both from the Nest
// app and from prisma/seed-demo.ts, which runs under plain ts-node without tsconfig-paths — so
// only relative imports and @prisma/client / @faker-js/faker are allowed here.

// Keep in sync with DEMO_EMAIL in @badger/shared-data (checked by demo-data.constants.spec.ts).
export const DEMO_EMAIL = "demo@demo.demo";
export const DEMO_BANK_ACCOUNT_NAME = "Bank Account";
export const DEMO_CARD_ACCOUNT_NAME = "Credit Card";
// Balance-only accounts (see demo-balances.ts): no transaction history of their own, just a
// denormalized balance refreshed on every demo login, added to give the dashboard's Accounts
// section every tile variant to show. DEMO_CARD_ACCOUNT_NAME above doubles as the fourth: it
// already carries real card-spend history, so it's reused as the utilized_credit-with-limit case.
export const DEMO_SAVINGS_ACCOUNT_NAME = "Savings Account";
export const DEMO_CAL_CARD_NAME = "Cal Card";
export const DEMO_NO_LIMIT_CARD_NAME = "Amex Card";
// Day of month a Cal-style card's next charge debits, mirroring the card-payoff day used for the
// main demo card below.
export const DEMO_CAL_DEBIT_DAY = 15;
export const SALARY_DESCRIPTION = "Monthly Salary";
// Matches the system CardPayoffPattern in seed.ts, so demo card-payoff transfers look identical
// to ones a real scraper import would produce.
export const CARD_PAYOFF_DESCRIPTION = "כ.א.ל חיוב";
// Synced card ATM withdrawal (one per month), labelled the way Cal labels card cash withdrawals so the
// cash-withdrawal hint fires. Synthetic merchant; amounts are picked deterministically (no faker).
export const DEMO_ATM_DESCRIPTION = "Demo Bank ATM";
export const DEMO_ATM_AMOUNTS = [300, 400, 500, 700, 1000];
// Inlined (not imported from @badger/shared-data): seed-demo.ts runs under plain ts-node without
// tsconfig-paths. Keep in sync with CASH_WITHDRAWAL_LABEL in @badger/shared-data.
export const CASH_WITHDRAWAL_LABEL = "משיכת מזומן";
// How many months of demo transaction history to keep around, ending on "today".
export const DEMO_WINDOW_MONTHS = 12;

// Category definitions (colors/icons mirror the system-category reference in seed.ts).
// Icons are AVATAR_ICON_NAMES values; demo-icons.spec.ts enforces it.
export type CatDef = { name: string; color: string; icon: string };

export const NEEDS_CATEGORIES: CatDef[] = [
    { name: "Groceries", color: "#10B981", icon: "shopping-cart" },
    { name: "Bills", color: "#EF4444", icon: "receipt" },
    { name: "Transportation", color: "#06B6D4", icon: "bus" },
    { name: "Car & Gas", color: "#475569", icon: "car" },
    { name: "Healthcare", color: "#DB2777", icon: "hospital" },
    { name: "Insurance", color: "#0891B2", icon: "shield" },
    { name: "Telecom", color: "#4F46E5", icon: "smartphone" },
];

export const WANTS_CATEGORIES: CatDef[] = [
    { name: "Restaurants", color: "#DC2626", icon: "utensils" },
    { name: "Coffee & Snacks", color: "#78350F", icon: "coffee" },
    { name: "Entertainment", color: "#A855F7", icon: "film" },
    { name: "Shopping", color: "#7C3AED", icon: "shopping-bag" },
    { name: "Clothing", color: "#7C3AED", icon: "shirt" },
];

export const SALARY_CATEGORY: CatDef = { name: "Salary", color: "#22C55E", icon: "banknote" };

// Per-category expense config: amount range (ILS), rough monthly frequency weight, merchants.
// Merchants mix Hebrew and English the way Israeli card statements do; a merchant listed under
// two categories keeps one spelling so per-merchant views don't split it.
export type ExpenseConfig = { min: number; max: number; weight: number; merchants: string[] };

export const EXPENSE_CONFIG: Record<string, ExpenseConfig> = {
    Groceries: {
        min: 80,
        max: 450,
        weight: 8,
        merchants: ["שופרסל דיל", "רמי לוי שיווק השקמה", "Victory", "אושר עד", "Yochananof"],
    },
    Bills: { min: 200, max: 900, weight: 2, merchants: ["חברת החשמל", "Water Corp", "ארנונה עירייה", "Gas Utility"] },
    Transportation: { min: 10, max: 60, weight: 4, merchants: ["רב-קו", "Gett", "Yango", "Bus Fare"] },
    "Car & Gas": { min: 150, max: 400, weight: 2, merchants: ["פז", "Delek", "סונול", "Dor Alon"] },
    Healthcare: { min: 50, max: 500, weight: 1, merchants: ["כללית", "Maccabi", "סופר-פארם", "Dental Clinic"] },
    Insurance: { min: 200, max: 600, weight: 1, merchants: ["Harel", "מנורה מבטחים", "Clal Insurance", "הפניקס"] },
    Telecom: { min: 50, max: 150, weight: 1, merchants: ["Cellcom", "פרטנר", "Pelephone", "HOT Mobile"] },
    Restaurants: { min: 60, max: 250, weight: 5, merchants: ["ארומה", "קפה קפה", "Vitrina", "Moses", "Sushi Bar"] },
    "Coffee & Snacks": { min: 12, max: 45, weight: 5, merchants: ["ארומה", "Cofix", "Landwer", "רולדין"] },
    Entertainment: {
        min: 40,
        max: 200,
        weight: 2,
        merchants: ["Cinema City", "יס פלאנט", "Spotify", "Netflix", "Steam"],
    },
    Shopping: { min: 50, max: 400, weight: 2, merchants: ["Amazon", "AliExpress", "KSP", "איבורי", "Fox Home"] },
    Clothing: { min: 80, max: 350, weight: 2, merchants: ["קסטרו", "Zara", "H&M", "רנואר", "Fox"] },
};

// Manual (non-synced) cash expenses on the bank account. They carry no externalId, so the demo
// shows fully editable rows next to the locked synced ones. Categories are EXPENSE_CONFIG keys.
export const CASH_EXPENSES: { description: string; category: string; min: number; max: number }[] = [
    { description: "Cash – Farmers market", category: "Groceries", min: 40, max: 160 },
    { description: "Cash – Barber", category: "Shopping", min: 50, max: 120 },
    { description: "Cash – Street food", category: "Restaurants", min: 20, max: 70 },
    { description: "Cash – Taxi", category: "Transportation", min: 30, max: 90 },
    { description: "Cash – Coffee cart", category: "Coffee & Snacks", min: 10, max: 30 },
];
