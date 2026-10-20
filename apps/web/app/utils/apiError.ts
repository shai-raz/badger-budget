interface ApiErrorShape {
    response?: { data?: { message?: unknown } };
}

/** Extract the server-provided message from an Axios-style API error, falling back to `fallback`. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error !== "object" || error === null) return fallback;
    const message = (error as ApiErrorShape).response?.data?.message;
    if (typeof message === "string" && message.length > 0) return message;
    if (Array.isArray(message) && message.length > 0 && message.every((m) => typeof m === "string")) {
        return message.join(", ");
    }
    return fallback;
}

/** Return `error.message` for real Errors with a non-empty message, otherwise `fallback`. */
export function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
