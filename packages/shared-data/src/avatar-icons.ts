/**
 * Registry of icon names a category or account avatar may store. These are the only
 * allowed stored values for `categories.icon` and `accounts.icon`. The API validates
 * against this list, the web picks from it in the IconPicker and maps each name to a
 * Lucide component in apps/web/app/utils/avatarIcons.ts. `suggestAvatarIcon` is the
 * single source of truth for name -> icon defaults.
 */

export const AVATAR_ICON_GROUPS = [
    { id: "food", label: "Food & drink" },
    { id: "shopping", label: "Shopping" },
    { id: "home", label: "Home & bills" },
    { id: "transport", label: "Transport" },
    { id: "health", label: "Health & care" },
    { id: "leisure", label: "Leisure" },
    { id: "travel", label: "Travel" },
    { id: "family", label: "Family & pets" },
    { id: "work", label: "Work & education" },
    { id: "money", label: "Money" },
    { id: "other", label: "Other" },
] as const;

export type AvatarIconGroupId = (typeof AVATAR_ICON_GROUPS)[number]["id"];

/** Stored icon names, in picker order (grouped as in AVATAR_ICON_GROUPS). */
export const AVATAR_ICON_NAMES = [
    // food
    "shopping-cart",
    "utensils",
    "coffee",
    "pizza",
    "hamburger",
    "apple",
    "cake-slice",
    "wine",
    // shopping
    "shopping-bag",
    "shopping-basket",
    "store",
    "shirt",
    "package",
    // home
    "house",
    "sofa",
    "lightbulb",
    "zap",
    "droplet",
    "flame",
    "wifi",
    "smartphone",
    "wrench",
    "spray-can",
    "receipt",
    // transport
    "car",
    "fuel",
    "bus",
    "train-front",
    "bike",
    "circle-parking",
    // health
    "hospital",
    "heart-pulse",
    "pill",
    "stethoscope",
    "dumbbell",
    "scissors",
    "sparkles",
    // leisure
    "film",
    "popcorn",
    "ticket",
    "music",
    "gamepad-2",
    "book-open",
    "palette",
    // travel
    "plane",
    "luggage",
    "hotel",
    "map",
    "tree-palm",
    // family
    "baby",
    "users",
    "dog",
    "paw-print",
    "heart",
    "hand-heart",
    "gift",
    // work
    "briefcase",
    "laptop",
    "graduation-cap",
    "school",
    "building",
    // money
    "banknote",
    "wallet",
    "credit-card",
    "piggy-bank",
    "landmark",
    "coins",
    "trending-up",
    "shield",
    "umbrella",
    "repeat",
    // other
    "tag",
    "circle-help",
] as const;

export type AvatarIconName = (typeof AVATAR_ICON_NAMES)[number];

export interface AvatarIconMeta {
    group: AvatarIconGroupId;
    /** Sentence-case accessible label. */
    label: string;
    /** Lower-case English words and aliases, plus a few Hebrew ones. Unique across the table. */
    keywords: readonly string[];
}

export const AVATAR_ICON_META: Record<AvatarIconName, AvatarIconMeta> = {
    "shopping-cart": {
        group: "food",
        label: "Shopping cart",
        keywords: ["grocer", "grocery", "supermarket", "סופר", "סופרמרקט", "מזון", "מכולת"],
    },
    utensils: {
        group: "food",
        label: "Utensils",
        keywords: ["restaurant", "dining", "food", "eat", "takeaway", "מסעד", "אוכל"],
    },
    coffee: { group: "food", label: "Coffee", keywords: ["coffee", "cafe", "קפה"] },
    pizza: { group: "food", label: "Pizza", keywords: ["pizza", "delivery"] },
    hamburger: { group: "food", label: "Hamburger", keywords: ["burger", "fast food"] },
    apple: { group: "food", label: "Apple", keywords: ["apple", "fruit", "produce"] },
    "cake-slice": { group: "food", label: "Cake slice", keywords: ["cake", "bakery", "dessert", "מאפייה"] },
    wine: { group: "food", label: "Wine", keywords: ["wine", "alcohol", "bar", "liquor", "יין"] },
    "shopping-bag": { group: "shopping", label: "Shopping bag", keywords: ["shopping", "purchases", "קניות"] },
    "shopping-basket": { group: "shopping", label: "Shopping basket", keywords: ["basket", "market", "supplies"] },
    store: { group: "shopping", label: "Store", keywords: ["store", "retail", "boutique"] },
    shirt: {
        group: "shopping",
        label: "Shirt",
        keywords: ["clothing", "clothes", "apparel", "fashion", "ביגוד", "הלבשה", "אופנה"],
    },
    package: { group: "shopping", label: "Package", keywords: ["package", "parcel", "shipping"] },
    house: {
        group: "home",
        label: "House",
        keywords: ["rent", "mortgage", "home", "housing", "בית", "שכירות"],
    },
    sofa: { group: "home", label: "Sofa", keywords: ["furniture", "couch", "ריהוט"] },
    lightbulb: { group: "home", label: "Light bulb", keywords: ["light", "bulb", "lamp"] },
    zap: { group: "home", label: "Lightning", keywords: ["electricity", "electric", "power", "חשמל"] },
    droplet: { group: "home", label: "Droplet", keywords: ["water", "plumbing", "מים"] },
    flame: { group: "home", label: "Flame", keywords: ["heating", "cooking gas", "גז"] },
    wifi: { group: "home", label: "Wi-Fi", keywords: ["wifi", "internet", "broadband", "אינטרנט"] },
    smartphone: {
        group: "home",
        label: "Smartphone",
        keywords: ["phone", "mobile", "cellular", "סלולר", "תקשורת"],
    },
    wrench: { group: "home", label: "Wrench", keywords: ["repair", "maintenance", "handyman"] },
    "spray-can": { group: "home", label: "Spray can", keywords: ["cleaning", "cleaner", "detergent"] },
    receipt: { group: "home", label: "Receipt", keywords: ["receipt", "bill", "invoice"] },
    car: { group: "transport", label: "Car", keywords: ["car", "vehicle", "auto", "רכב"] },
    fuel: {
        group: "transport",
        label: "Fuel pump",
        keywords: ["fuel", "gas", "petrol", "diesel", "gas station", "דלק"],
    },
    bus: { group: "transport", label: "Bus", keywords: ["transport", "transit", "bus", "תחבורה"] },
    "train-front": { group: "transport", label: "Train", keywords: ["train", "rail", "metro", "רכבת"] },
    bike: { group: "transport", label: "Bicycle", keywords: ["bike", "bicycle", "cycling"] },
    "circle-parking": { group: "transport", label: "Parking", keywords: ["parking", "garage", "חניה"] },
    hospital: {
        group: "health",
        label: "Hospital",
        keywords: ["hospital", "medical", "doctor", "health", "רפואה", "בריאות"],
    },
    "heart-pulse": { group: "health", label: "Heart pulse", keywords: ["cardio", "pulse", "cardiology"] },
    pill: { group: "health", label: "Pill", keywords: ["pharmacy", "medicine", "prescription", "מרקחת"] },
    stethoscope: { group: "health", label: "Stethoscope", keywords: ["clinic", "checkup", "dentist", "dental"] },
    dumbbell: { group: "health", label: "Dumbbell", keywords: ["gym", "fitness", "sport", "ספורט"] },
    scissors: { group: "health", label: "Scissors", keywords: ["haircut", "barber", "salon", "מספרה"] },
    sparkles: { group: "health", label: "Sparkles", keywords: ["beauty", "cosmetics", "spa", "קוסמטיקה"] },
    film: { group: "leisure", label: "Film", keywords: ["movie", "cinema", "film", "קולנוע"] },
    popcorn: { group: "leisure", label: "Popcorn", keywords: ["popcorn", "snack", "candy"] },
    ticket: {
        group: "leisure",
        label: "Ticket",
        keywords: ["entertainment", "events", "leisure", "פנאי", "בילוי"],
    },
    music: { group: "leisure", label: "Music", keywords: ["music", "concert", "מוזיקה"] },
    "gamepad-2": { group: "leisure", label: "Game controller", keywords: ["game", "gaming", "console"] },
    "book-open": { group: "leisure", label: "Open book", keywords: ["books", "book", "reading", "ספרים"] },
    palette: { group: "leisure", label: "Palette", keywords: ["art", "hobby", "paint", "crafts"] },
    plane: {
        group: "travel",
        label: "Airplane",
        keywords: ["flight", "airline", "travel", "טיסות", "תעופה"],
    },
    luggage: { group: "travel", label: "Luggage", keywords: ["luggage", "baggage", "suitcase"] },
    hotel: { group: "travel", label: "Hotel", keywords: ["hotel", "lodging", "מלון"] },
    map: { group: "travel", label: "Map", keywords: ["map", "navigation", "trip", "tour"] },
    "tree-palm": { group: "travel", label: "Palm tree", keywords: ["vacation", "holiday", "beach", "resort"] },
    baby: {
        group: "family",
        label: "Baby",
        keywords: ["kids", "children", "baby", "childcare", "ילדים"],
    },
    users: { group: "family", label: "People", keywords: ["family", "household", "people"] },
    dog: { group: "family", label: "Dog", keywords: ["dog", "puppy", "kennel"] },
    "paw-print": { group: "family", label: "Paw print", keywords: ["pets", "pet", "vet", "חיות"] },
    heart: { group: "family", label: "Heart", keywords: ["heart", "love", "romance"] },
    "hand-heart": { group: "family", label: "Hand with heart", keywords: ["charity", "donation", "תרומות"] },
    gift: { group: "family", label: "Gift", keywords: ["gift", "present", "birthday", "מתנות"] },
    briefcase: { group: "work", label: "Briefcase", keywords: ["work", "freelance", "business"] },
    laptop: { group: "work", label: "Laptop", keywords: ["laptop", "computer", "software", "electronics"] },
    "graduation-cap": {
        group: "work",
        label: "Graduation cap",
        keywords: ["education", "tuition", "course", "חינוך"],
    },
    school: { group: "work", label: "School", keywords: ["school", "kindergarten", "tutoring"] },
    building: { group: "work", label: "Office building", keywords: ["office", "coworking", "workspace"] },
    banknote: {
        group: "money",
        label: "Banknote",
        keywords: ["salary", "income", "wage", "paycheck", "משכורת"],
    },
    wallet: { group: "money", label: "Wallet", keywords: ["wallet", "cash", "atm"] },
    "credit-card": {
        group: "money",
        label: "Credit card",
        keywords: ["credit card", "credit", "debit", "card"],
    },
    "piggy-bank": { group: "money", label: "Piggy bank", keywords: ["savings", "saving", "piggy"] },
    landmark: {
        group: "money",
        label: "Landmark",
        keywords: ["tax", "government", "municipal", "bank", "עירייה", "ארנונה"],
    },
    coins: { group: "money", label: "Coins", keywords: ["coins", "coin", "crypto"] },
    "trending-up": { group: "money", label: "Trending up", keywords: ["investment", "stocks", "brokerage"] },
    shield: { group: "money", label: "Shield", keywords: ["insurance", "ביטוח", "protection"] },
    umbrella: { group: "money", label: "Umbrella", keywords: ["umbrella", "emergency", "rescue"] },
    repeat: {
        group: "money",
        label: "Repeat",
        keywords: ["subscription", "subscriptions", "recurring", "מנויים"],
    },
    tag: { group: "other", label: "Tag", keywords: ["misc", "miscellaneous", "other", "tag"] },
    "circle-help": { group: "other", label: "Question mark", keywords: ["unknown", "question", "help"] },
};

export const AVATAR_ICONS_BY_GROUP: readonly {
    id: AvatarIconGroupId;
    label: string;
    icons: readonly AvatarIconName[];
}[] = AVATAR_ICON_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    icons: AVATAR_ICON_NAMES.filter((name) => AVATAR_ICON_META[name].group === group.id),
}));

export const isAvatarIconName = (v: string | null | undefined): v is AvatarIconName =>
    !!v && (AVATAR_ICON_NAMES as readonly string[]).includes(v);

export const DEFAULT_CATEGORY_AVATAR_ICON: AvatarIconName = "tag";

const HEBREW_PREFIX_LETTERS = new Set(["ה", "ו", "ב", "ל", "מ", "ש"]);
const WORD_SUFFIXES = ["s", "es", "ים", "ות"];

/** A token matches itself, and also its form without a leading Hebrew prefix letter. */
function tokenForms(token: string): string[] {
    const forms = [token];
    if (token.length > 2 && HEBREW_PREFIX_LETTERS.has(token.charAt(0))) forms.push(token.slice(1));
    return forms;
}

function wordMatches(keyword: string, form: string): boolean {
    if (form === keyword) return true;
    if (keyword.length >= 4 && form.startsWith(keyword)) return true;
    return WORD_SUFFIXES.some((suffix) => form === keyword + suffix);
}

/** First token position where every word of the keyword matches, or -1. */
function firstMatchPosition(words: readonly string[], tokenForm: string[][]): number {
    for (let i = 0; i + words.length <= tokenForm.length; i++) {
        if (words.every((word, j) => (tokenForm[i + j] ?? []).some((form) => wordMatches(word, form)))) return i;
    }
    return -1;
}

/**
 * Pick a registry icon for a free-text name (a category or account name), in English or
 * Hebrew. Earlier matches win, then longer keywords, then registry order. Returns null when
 * nothing matches.
 */
export function suggestAvatarIcon(name: string | null | undefined): AvatarIconName | null {
    if (!name) return null;
    const tokens = name
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    if (tokens.length === 0) return null;
    const tokenForm = tokens.map(tokenForms);

    let best: { icon: AvatarIconName; position: number; length: number } | null = null;
    for (const icon of AVATAR_ICON_NAMES) {
        for (const keyword of AVATAR_ICON_META[icon].keywords) {
            const position = firstMatchPosition(keyword.split(" "), tokenForm);
            if (position < 0) continue;
            if (!best || position < best.position || (position === best.position && keyword.length > best.length)) {
                best = { icon, position, length: keyword.length };
            }
        }
    }
    return best?.icon ?? null;
}

/** Default icon for a category: the suggested match for its name, else the generic tag. */
export function defaultCategoryIcon(name: string | null | undefined): AvatarIconName {
    return suggestAvatarIcon(name) ?? DEFAULT_CATEGORY_AVATAR_ICON;
}
