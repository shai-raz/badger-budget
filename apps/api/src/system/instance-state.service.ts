import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const INSTANCE_STATE_KEYS = ["update-notifier.last-notified-version"] as const;
export type InstanceStateKey = (typeof INSTANCE_STATE_KEYS)[number];

/** Instance-wide JSON values keyed by InstanceStateKey. Not per user, so no user scoping. */
@Injectable()
export class InstanceStateService {
    constructor(private readonly prisma: PrismaService) {}

    /** The stored value, or null when the key was never set. */
    async get(key: InstanceStateKey): Promise<unknown> {
        const row = await this.prisma.instanceState.findUnique({ where: { key }, select: { value: true } });
        return row?.value ?? null;
    }

    async set(key: InstanceStateKey, value: Prisma.InputJsonValue): Promise<void> {
        await this.prisma.instanceState.upsert({
            where: { key },
            create: { key, value },
            update: { value },
        });
    }
}
