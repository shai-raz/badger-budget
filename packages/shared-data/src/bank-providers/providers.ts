export const BANK_PROVIDERS = [
    { companyId: "hapoalim", name: "Bank Hapoalim", loginFields: ["userCode", "password"] },
    { companyId: "leumi", name: "Bank Leumi", loginFields: ["username", "password"] },
    { companyId: "discount", name: "Discount Bank", loginFields: ["id", "password", "num"] },
    { companyId: "mercantile", name: "Mercantile Bank", loginFields: ["id", "password", "num"] },
    { companyId: "mizrahi", name: "Mizrahi Bank", loginFields: ["username", "password"] },
    { companyId: "otsar", name: "Otsar Hahayal", loginFields: ["username", "password"] },
    { companyId: "visaCal", name: "Visa Cal", loginFields: ["username", "password"] },
    { companyId: "max", name: "Max", loginFields: ["username", "password"] },
    { companyId: "isracard", name: "Isracard", loginFields: ["id", "card6Digits", "password"] },
    { companyId: "amex", name: "Amex", loginFields: ["username", "card6Digits", "password"] },
    { companyId: "union", name: "Union Bank", loginFields: ["username", "password"] },
    { companyId: "beinleumi", name: "Beinleumi", loginFields: ["username", "password"] },
    { companyId: "massad", name: "Massad", loginFields: ["username", "password"] },
    { companyId: "yahav", name: "Yahav", loginFields: ["username", "password", "nationalID"] },
    { companyId: "beyhadBishvilha", name: "Beyhad Bishvilha", loginFields: ["id", "password"] },
] as const;

export type BankProvider = (typeof BANK_PROVIDERS)[number];
export type BankCompanyId = BankProvider["companyId"];
