/** "1 rule", "0 rules", "14 categories". Pass the irregular plural explicitly, e.g. countLabel(n, "category", "categories"). */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

/** The Settings row subtitle for connected apps: "No apps connected", or the count and the names. */
export function connectedAppsLabel(names: readonly string[]): string {
    if (names.length === 0) return "No apps connected";
    return `${countLabel(names.length, "app")} connected · ${names.join(", ")}`;
}
