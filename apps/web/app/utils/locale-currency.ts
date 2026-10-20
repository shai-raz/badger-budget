/**
 * Derive an ISO 4217 currency code from the browser locale.
 * Uses the Intl.Locale API where supported; falls back to ILS.
 *
 * This is used as a hint when creating new accounts so they get a sensible
 * default currency. It is not authoritative — users can update it later.
 */

// Region → ISO 4217 currency code. Covers the most common cases.
const REGION_TO_CURRENCY: Record<string, string> = {
    IL: "ILS",
    US: "USD",
    GB: "GBP",
    EU: "EUR",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    NL: "EUR",
    BE: "EUR",
    AT: "EUR",
    PT: "EUR",
    JP: "JPY",
    CN: "CNY",
    IN: "INR",
    AU: "AUD",
    CA: "CAD",
    CH: "CHF",
    SE: "SEK",
    NO: "NOK",
    DK: "DKK",
    NZ: "NZD",
    SG: "SGD",
    HK: "HKD",
    KR: "KRW",
    BR: "BRL",
    MX: "MXN",
    ZA: "ZAR",
    AE: "AED",
    SA: "SAR",
    TR: "TRY",
    PL: "PLN",
    CZ: "CZK",
    HU: "HUF",
    RO: "RON",
};

export function getLocaleCurrencyCode(): string {
    try {
        if (typeof navigator === "undefined") return "ILS";
        const locale = new Intl.Locale(navigator.language);
        const region = locale.region?.toUpperCase();
        if (region && REGION_TO_CURRENCY[region]) {
            return REGION_TO_CURRENCY[region];
        }
    } catch {
        // Intl.Locale may not be supported in older environments
    }
    return "ILS";
}
