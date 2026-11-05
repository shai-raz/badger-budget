import { Transform } from "class-transformer";

/**
 * Accepts a comma-separated query value (`a,b`) or a repeated query param
 * (`?x=a&x=b`) and normalises it to a trimmed string array without empty
 * entries. Non-string array members and other values pass through unchanged so
 * the validators on the property reject them.
 */
export function CsvToArray(): PropertyDecorator {
    return Transform(({ value }) => {
        if (typeof value === "string") {
            return value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
        }
        if (Array.isArray(value)) {
            return value
                .map((item) => (typeof item === "string" ? item.trim() : item))
                .filter((item) => typeof item === "string" && item.length > 0);
        }
        return value;
    });
}
