import { readFileSync } from "fs";
import { join } from "path";
import { DEMO_EMAIL } from "../demo/demo-data.constants";

// The migration is hand-written SQL, so the only check that its backfill keeps the demo user out and picks the oldest
// live real user is to read it. Behaviour is verified against a real database when the migration is applied.
describe("user role migration (20261026120000_user_role)", () => {
    const sql = readFileSync(join(__dirname, "../../prisma/migrations/20261026120000_user_role/migration.sql"), "utf8");

    it("adds the role column with USER as the default", () => {
        expect(sql).toContain("DEFAULT 'USER'");
    });

    it("backfills ADMIN only for a live, non-demo user, oldest first", () => {
        expect(sql).toContain(`'${DEMO_EMAIL}'`);
        expect(sql).toContain('"deleted_at" IS NULL');
        expect(sql).toContain('ORDER BY "created_at"');
        expect(sql).toContain("LIMIT 1");
    });
});
