export interface ICashWithdrawalPattern {
    id: string;
    userId: string | null;
    isSystem: boolean;
    matchField: "description" | "additionalDescription";
    text: string;
    createdAt: Date;
    updatedAt: Date;
}
