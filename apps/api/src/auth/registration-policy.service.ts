import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEMO_EMAIL } from "../demo/demo-data.constants";

/** Postgres advisory-lock id that serializes registrations, so two concurrent first sign-ups can't both pass the check. */
export const REGISTRATION_LOCK_KEY = 20_001;

/**
 * Decides whether new accounts may be created on this instance. Registration is open until the first
 * non-demo user exists (soft-deleted users count, so deleting the admin account doesn't reopen signup);
 * after that it is closed unless ALLOW_REGISTRATION=true.
 */
@Injectable()
export class RegistrationPolicyService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) {}

    isRegistrationForced(): boolean {
        return this.config.get<string>("ALLOW_REGISTRATION") === "true";
    }

    async isRegistrationOpen(db: Pick<PrismaService, "user"> = this.prisma): Promise<boolean> {
        if (this.isRegistrationForced()) {
            return true;
        }
        const count = await db.user.count({ where: { email: { not: DEMO_EMAIL } } });
        return count === 0;
    }

    async assertRegistrationOpen(db: Pick<PrismaService, "user"> = this.prisma): Promise<void> {
        if (!(await this.isRegistrationOpen(db))) {
            throw new ForbiddenException(
                "Registration is closed on this instance. The administrator can set ALLOW_REGISTRATION=true to allow new accounts.",
            );
        }
    }

    /** Call inside the user-creation transaction: the advisory lock is held until commit, so the check and the insert are atomic. */
    async lockAndAssert(tx: Prisma.TransactionClient): Promise<void> {
        // $executeRaw, not $queryRaw: Prisma can't deserialize the void result of pg_advisory_xact_lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`;
        await this.assertRegistrationOpen(tx);
    }
}
