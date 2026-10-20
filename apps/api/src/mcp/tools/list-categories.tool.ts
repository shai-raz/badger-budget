import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { CategoriesService } from "../../categories/categories.service";
import { toColumnar } from "./columnar";
import type { McpToolDefinition } from "./tool.types";

const inputSchema = z.object({}).strict();

@Injectable()
export class ListCategoriesTool implements McpToolDefinition<typeof inputSchema> {
    readonly name = "list_categories";
    readonly title = "List categories";
    readonly description =
        "Lists the transaction categories available to the user (system categories plus the user's own) as columnar rows. " +
        "`isSystem` is true for built-in categories. The `id` values can be passed to search_transactions `categoryIds`, " +
        'together with the special value "uncategorized" for transactions that have no category.';
    readonly inputSchema = inputSchema;

    constructor(private readonly categories: CategoriesService) {}

    async execute(userId: string): Promise<unknown> {
        const categories = await this.categories.findAll(userId);
        return toColumnar(
            ["id", "name", "isSystem"],
            categories.map((c) => ({ id: c.id, name: c.name, isSystem: c.isSystem })),
        );
    }
}
