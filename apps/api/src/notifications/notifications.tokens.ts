/**
 * Registry of notification types (NotificationTypeRegistry<string>). Production provides the shared
 * NOTIFICATION_TYPE_REGISTRY; specs inject fixtures.
 */
export const NOTIFICATION_REGISTRY = Symbol("NOTIFICATION_REGISTRY");

/**
 * Per-type predicates for conditionally mandatory types (e.g. auto-sync, #124), evaluated per user.
 * A type with a rule here is mandatory for the users the predicate returns true for. Production provides {}.
 */
export type MandatoryRules = Partial<Record<string, (userId: string) => Promise<boolean>>>;
export const NOTIFICATION_MANDATORY_RULES = Symbol("NOTIFICATION_MANDATORY_RULES");

export const PUSH_SENDER = Symbol("PUSH_SENDER");
export const VAPID_CONFIG = Symbol("VAPID_CONFIG");
