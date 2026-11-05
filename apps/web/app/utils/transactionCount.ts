/** "1 transaction" / "N transactions", with the count grouped by locale (e.g. 1,234). */
export function transactionCountText(total: number): string {
    return `${total.toLocaleString()} ${total === 1 ? "transaction" : "transactions"}`;
}
