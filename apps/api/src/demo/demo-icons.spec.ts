import { readFileSync } from "fs";
import { join } from "path";
import { AVATAR_ICON_NAMES } from "@badger/shared-data";
import { NEW_BALANCE_ACCOUNTS } from "./demo-balances";
import { NEEDS_CATEGORIES, SALARY_CATEGORY, WANTS_CATEGORIES } from "./demo-data.constants";

const registry = new Set<string>(AVATAR_ICON_NAMES);

describe("demo avatar icons", () => {
    it("uses only registry names for demo category icons", () => {
        const categories = [...NEEDS_CATEGORIES, ...WANTS_CATEGORIES, SALARY_CATEGORY];
        for (const cat of categories) {
            expect({ name: cat.name, registered: registry.has(cat.icon) }).toEqual({
                name: cat.name,
                registered: true,
            });
        }
    });

    it("uses only registry names for demo balance account icons", () => {
        for (const acc of NEW_BALANCE_ACCOUNTS) {
            expect({ name: acc.name, registered: registry.has(acc.icon) }).toEqual({
                name: acc.name,
                registered: true,
            });
        }
    });

    it("uses only registry names for every icon literal in prisma/seed-demo.ts", () => {
        const source = readFileSync(join(__dirname, "../../prisma/seed-demo.ts"), "utf8");
        const literals = [...source.matchAll(/icon:\s*"([^"]+)"/g)].map((m) => m[1]);
        expect(literals.length).toBeGreaterThan(0);
        expect(literals.filter((icon) => !registry.has(icon))).toEqual([]);
    });
});
