import { z } from "zod";

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function isValidDate(value: string): boolean {
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const dateField = (label: string) =>
    z.string().regex(DATE_RE, "Expected YYYY-MM-DD").refine(isValidDate, "Not a valid calendar date").describe(label);
