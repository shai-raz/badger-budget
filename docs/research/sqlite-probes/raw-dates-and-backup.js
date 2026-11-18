// Prisma 6 native SQLite: how raw SQL stores dates, mixed TEXT/INTEGER comparisons, VACUUM INTO. Run: DATABASE_URL=file:./dev.db node raw-dates-and-backup.js
// Setup: see docs/research/sqlite-default-database.md, Appendix.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
    const u = await p.user.findFirst();
    await p.$executeRaw`UPDATE users SET updated_at = ${new Date("2026-01-02T03:04:05Z")} WHERE id = ${u.id}`;
    console.log(
        "raw-bound Date stored as:",
        await p.$queryRawUnsafe(
            `SELECT typeof(updated_at) t, CAST(updated_at AS TEXT) v FROM users WHERE id='${u.id}'`,
        ),
    );
    console.log("prisma reads:", (await p.user.findUnique({ where: { id: u.id } })).updatedAt);
    console.log(
        "ordering vs integer rows (gt 2025):",
        await p.user.count({ where: { updatedAt: { gt: new Date("2025-01-01") } } }),
        "of",
        await p.user.count(),
    );
    await p.$executeRawUnsafe(`UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id='${u.id}'`);
    try {
        console.log("CURRENT_TIMESTAMP read:", (await p.user.findUnique({ where: { id: u.id } })).updatedAt);
    } catch (e) {
        console.log("CURRENT_TIMESTAMP read ERR:", e.message.split("\n").pop());
    }
    console.log(
        "count gt 2025 after CURRENT_TIMESTAMP:",
        await p.user.count({ where: { updatedAt: { gt: new Date("2025-01-01") } } }),
        "of",
        await p.user.count(),
    );
    const f = __dirname + "/backup-test.db";
    require("fs").rmSync(f, { force: true });
    await p.$executeRaw`VACUUM INTO ${f}`;
    console.log("VACUUM INTO bound param ok, size", require("fs").statSync(f).size);
    await p.$disconnect();
})().catch((e) => {
    console.log("ERR", e.message);
});
