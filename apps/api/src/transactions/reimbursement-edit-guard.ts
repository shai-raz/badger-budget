import { BadRequestException } from "@nestjs/common";
import { toCents } from "./reimbursement-netting";

export interface ReimbursementGuardSnapshot {
    type: string;
    amount: unknown;
    currencyId: string;
    /** Sum of allocations where this row is the expense (its income side paid it back). */
    allocatedAsExpense: number;
    /** Sum of allocations where this row is the income (it paid back other expenses). */
    allocatedAsIncome: number;
}

export interface ReimbursementGuardDto {
    type?: string;
    amount?: number;
    currencyId?: string;
}

/**
 * Rejects edits to a linked transaction that would break its allocations: shrinking the amount below what is
 * allocated, or changing currency or type. Hidden toggles never affect allocations and are always allowed.
 * Unlinked rows (no allocations on the row's current role) pass through untouched.
 */
export function assertReimbursementEditAllowed(current: ReimbursementGuardSnapshot, dto: ReimbursementGuardDto): void {
    const allocated =
        current.type === "expense"
            ? current.allocatedAsExpense
            : current.type === "income"
              ? current.allocatedAsIncome
              : 0;
    if (allocated <= 0) return;

    const hint = "Unlink or reduce the reimbursement first.";
    const linkedSuffix = `This transaction is linked to reimbursements (${allocated} allocated).`;

    if (dto.amount !== undefined && toCents(dto.amount) < toCents(allocated)) {
        throw new BadRequestException(`${linkedSuffix} ${hint}`);
    }
    if (dto.currencyId !== undefined && dto.currencyId !== current.currencyId) {
        throw new BadRequestException(`Can't change currency while linked to reimbursements. ${hint}`);
    }
    if (dto.type !== undefined && dto.type !== current.type) {
        throw new BadRequestException(`Can't change type while linked to reimbursements. ${hint}`);
    }
}
