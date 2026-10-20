// Kept in its own module so transaction mutations can invalidate accounts without a circular import.
export const accountKeys = {
    all: ["accounts"] as const,
    lists: () => [...accountKeys.all, "list"] as const,
    list: () => [...accountKeys.lists()] as const,
    details: () => [...accountKeys.all, "detail"] as const,
    detail: (id: string) => [...accountKeys.details(), id] as const,
};
