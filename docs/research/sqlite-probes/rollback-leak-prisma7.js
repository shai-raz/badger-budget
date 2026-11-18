// Prisma 7 + @prisma/adapter-better-sqlite3: a write made outside an open transaction is rolled back with it. Run: node rollback-leak-prisma7.js
// Setup: see docs/research/sqlite-default-database.md, Appendix.
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:./dev.db" }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    const tag = "R" + Date.now();
    const long = p
        .$transaction(async (tx) => {
            await tx.dataBackfill.create({ data: { name: tag + "-inside" } });
            await sleep(1000);
            throw new Error("rollback on purpose");
        })
        .catch((e) => console.log("long:", e.message));
    await sleep(100);
    await p.dataBackfill.create({ data: { name: tag + "-outside" } });
    console.log("outside write returned while tx open");
    await long;
    console.log(
        "rows after rollback:",
        (await p.dataBackfill.findMany({ where: { name: { startsWith: tag } } })).map((r) => r.name),
    );
    await p.$disconnect();
})();
