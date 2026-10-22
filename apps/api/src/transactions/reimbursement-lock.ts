import type { Prisma } from "@prisma/client";

/**
 * Per-user advisory lock that serializes every reimbursement write (link create/edit/delete, and edits or deletes
 * of linked transactions), so a cap check and its write can't interleave with another one. Held until commit:
 * call it as the first statement inside a `$transaction`, before reading allocation sums.
 * $executeRaw, not $queryRaw: Prisma can't deserialize the void result of pg_advisory_xact_lock.
 */
export async function lockReimbursements(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reimbursement:${userId}`}))`;
}
