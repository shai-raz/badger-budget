import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
    NotificationRole,
    NotificationType,
    NotificationTypeDefinition,
    NotificationTypeRegistry,
} from "@badger/shared-data";
import type { INotificationPreference } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFICATION_MANDATORY_RULES, NOTIFICATION_REGISTRY, type MandatoryRules } from "./notifications.tokens";

export interface NotificationUser {
    id: string;
    role: NotificationRole;
}

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** Resolves who gets which notification: role gates, mandatory types and the per-user overrides over the defaults. */
@Injectable()
export class NotificationPreferencesService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(NOTIFICATION_REGISTRY) private readonly registry: NotificationTypeRegistry<string>,
        @Inject(NOTIFICATION_MANDATORY_RULES) private readonly mandatoryRules: MandatoryRules,
    ) {}

    /** Role gate only. A type without `roles` is open to everyone; an unknown type is never allowed. */
    allowedFor(type: string, role: NotificationRole): boolean {
        const def = this.definition(type);
        return def !== undefined && (def.roles === undefined || def.roles.includes(role));
    }

    async isMandatory(type: string, userId: string): Promise<boolean> {
        if (this.definition(type)?.mandatory) return true;
        const rule = hasOwn(this.mandatoryRules, type) ? this.mandatoryRules[type] : undefined;
        return rule !== undefined && (await rule(userId)) === true;
    }

    /** The settings page rows: listed types the user's role may receive, in registry order. */
    async list(user: NotificationUser): Promise<INotificationPreference[]> {
        const types = Object.keys(this.registry).filter(
            (type) => this.definition(type)?.listed && this.allowedFor(type, user.role),
        );
        const rows = await this.prisma.notificationPreference.findMany({
            where: { userId: user.id },
            select: { type: true, enabled: true },
        });
        const stored = new Map(rows.map((row) => [row.type, row.enabled]));

        return Promise.all(
            types.map(async (type) => {
                const def = this.registry[type];
                const mandatory = await this.isMandatory(type, user.id);
                return {
                    // Registry keys are NotificationType in production; the token is string-keyed only so specs can inject fixtures.
                    type: type as NotificationType,
                    label: def.label,
                    description: def.description,
                    enabled: mandatory || (stored.get(type) ?? def.defaultEnabled),
                    mandatory,
                };
            }),
        );
    }

    /**
     * Applies all-or-nothing: any invalid entry rejects the whole request before a write. A value equal to the default
     * deletes the override row instead of storing it.
     */
    async update(
        user: NotificationUser,
        prefs: { type: string; enabled: boolean }[],
    ): Promise<INotificationPreference[]> {
        for (const { type, enabled } of prefs) {
            const def = this.definition(type);
            if (!def?.listed || !this.allowedFor(type, user.role)) {
                throw new BadRequestException("Notification type is not available");
            }
            if (!enabled && (await this.isMandatory(type, user.id))) {
                throw new BadRequestException("This notification cannot be turned off");
            }
        }

        await this.prisma.$transaction(async (tx) => {
            for (const { type, enabled } of prefs) {
                const def = this.registry[type];
                if (enabled === def.defaultEnabled) {
                    await tx.notificationPreference.deleteMany({ where: { userId: user.id, type } });
                } else {
                    await tx.notificationPreference.upsert({
                        where: { userId_type: { userId: user.id, type } },
                        create: { userId: user.id, type, enabled },
                        update: { enabled },
                    });
                }
            }
        });

        return this.list(user);
    }

    /** Whether a notification of this type reaches the user now: role, then mandatory, then the stored value or the default. */
    async shouldSend(user: NotificationUser, type: string): Promise<boolean> {
        const def = this.definition(type);
        if (!def || !this.allowedFor(type, user.role)) return false;
        if (await this.isMandatory(type, user.id)) return true;

        const stored = await this.prisma.notificationPreference.findUnique({
            where: { userId_type: { userId: user.id, type } },
            select: { enabled: true },
        });
        return stored?.enabled ?? def.defaultEnabled;
    }

    private definition(type: string): NotificationTypeDefinition | undefined {
        return hasOwn(this.registry, type) ? this.registry[type] : undefined;
    }
}
