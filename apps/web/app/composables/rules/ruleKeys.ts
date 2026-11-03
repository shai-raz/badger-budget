import type { RulePreviewRequest } from "@badger/types";

// Kept in its own module so category and transaction mutations can invalidate rules without a circular import.
export const ruleKeys = {
    all: ["rules"] as const,
    lists: () => [...ruleKeys.all, "list"] as const,
    list: () => [...ruleKeys.lists()] as const,
    previews: () => [...ruleKeys.all, "preview"] as const,
    preview: (req: RulePreviewRequest) => [...ruleKeys.previews(), req] as const,
};
