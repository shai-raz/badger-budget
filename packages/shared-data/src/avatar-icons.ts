/**
 * Registry of icon names a category or account avatar may store. These are the only
 * allowed stored values for `categories.icon` and `accounts.icon`. The web maps each
 * name to a Lucide component in apps/web/app/utils/avatarIcons.ts, and validation and
 * a picker come in #213.
 */
export const AVATAR_ICON_NAMES = [
    "shopping-cart",
    "coffee",
    "utensils",
    "shirt",
    "bus",
    "hospital",
    "landmark",
    "sofa",
    "laptop",
    "receipt",
    "spray-can",
    "hand-heart",
    "film",
    "graduation-cap",
    "gift",
    "car",
    "shield",
    "smartphone",
    "shopping-bag",
    "circle-help",
    "banknote",
    "tag",
    "piggy-bank",
    "wallet",
    "credit-card",
    "house",
] as const;

export type AvatarIconName = (typeof AVATAR_ICON_NAMES)[number];

export const isAvatarIconName = (v: string | null | undefined): v is AvatarIconName =>
    !!v && (AVATAR_ICON_NAMES as readonly string[]).includes(v);

export const DEFAULT_CATEGORY_AVATAR_ICON: AvatarIconName = "tag";
