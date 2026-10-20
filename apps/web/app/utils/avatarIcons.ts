import type { Component } from "vue";
import {
    Banknote,
    Bus,
    Car,
    Coffee,
    CreditCard,
    CircleQuestionMark,
    Film,
    Gift,
    GraduationCap,
    HandHeart,
    Hospital,
    House,
    Landmark,
    Laptop,
    PiggyBank,
    Receipt,
    Shield,
    ShoppingBag,
    ShoppingCart,
    Shirt,
    Smartphone,
    Sofa,
    SprayCan,
    Tag,
    Utensils,
    Wallet,
} from "@lucide/vue";
import { isAvatarIconName, type AvatarIconName } from "@badger/shared-data";

/**
 * Lucide component for each stored avatar icon name. Named imports only, so the
 * bundle keeps just these glyphs. The `Record` type makes the map exhaustive: a name
 * added to AVATAR_ICON_NAMES without an entry here fails type-check.
 */
export const AVATAR_ICONS: Record<AvatarIconName, Component> = {
    "shopping-cart": ShoppingCart,
    coffee: Coffee,
    utensils: Utensils,
    shirt: Shirt,
    bus: Bus,
    hospital: Hospital,
    landmark: Landmark,
    sofa: Sofa,
    laptop: Laptop,
    receipt: Receipt,
    "spray-can": SprayCan,
    "hand-heart": HandHeart,
    film: Film,
    "graduation-cap": GraduationCap,
    gift: Gift,
    car: Car,
    shield: Shield,
    smartphone: Smartphone,
    "shopping-bag": ShoppingBag,
    "circle-help": CircleQuestionMark,
    banknote: Banknote,
    tag: Tag,
    "piggy-bank": PiggyBank,
    wallet: Wallet,
    "credit-card": CreditCard,
    house: House,
};

/**
 * Resolve a stored icon name to its Lucide component. Unknown names, `null`, and
 * legacy PrimeIcons/Font Awesome names (e.g. "tshirt") return the fallback's component.
 */
export function resolveAvatarIcon(name: string | null | undefined, fallback: AvatarIconName): Component {
    return AVATAR_ICONS[isAvatarIconName(name) ? name : fallback];
}

/**
 * Default icon for an account with no stored icon, keyed by account type.
 * Cash accounts get a wallet, credit cards a card, and everything else a bank.
 */
export function accountFallbackIcon(type: string | null | undefined): AvatarIconName {
    switch (type) {
        case "credit_card":
            return "credit-card";
        case "cash":
            return "wallet";
        default:
            return "landmark";
    }
}
