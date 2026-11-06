export interface SpentShare {
    /** Compact label, e.g. "42% spent". */
    short: string;
    /** Spoken/tooltip caption, e.g. "42% of income spent". */
    caption: string;
    /** Width of the spent bar, 0-100. */
    fillPercent: number;
}

/**
 * How much of the period's income went out as expenses, for the totals bar.
 * Above 100% the bar stays full; with spending but no income it reads as
 * "no income" rather than a percentage.
 */
export function spentShare(income: number, expenses: number): SpentShare {
    if (income > 0) {
        const pct = Math.round((expenses / income) * 100);
        return {
            short: `${pct}% spent`,
            caption: `${pct}% of income spent`,
            fillPercent: Math.min(pct, 100),
        };
    }

    if (expenses > 0) {
        return { short: "no income", caption: "Spending with no income", fillPercent: 100 };
    }

    return { short: "0% spent", caption: "Nothing spent yet", fillPercent: 0 };
}
