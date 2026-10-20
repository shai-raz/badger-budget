import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }

    // Helper to exclude sensitive fields
    exclude<T, Key extends keyof T>(entity: T, keys: Key[]): Omit<T, Key> {
        for (const key of keys) {
            delete entity[key];
        }
        return entity;
    }
}
