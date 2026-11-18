// Prisma 6 native SQLite: what a long write transaction does to concurrent reads/writes. Run: node lock-wait.js 'file:./dev.db' 7000
// Setup: see docs/research/sqlite-default-database.md, Appendix.
const { PrismaClient } = require("@prisma/client");
const url = process.argv[2];
const prisma = new PrismaClient({ datasources: { db: { url } } });
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === "bigint" ? Number(v) : v));
(async () => {
    console.log("url", url);
    console.log(
        "pragmas",
        j([
            await prisma.$queryRawUnsafe("PRAGMA journal_mode"),
            await prisma.$queryRawUnsafe("PRAGMA busy_timeout"),
            await prisma.$queryRawUnsafe("PRAGMA foreign_keys"),
            await prisma.$queryRawUnsafe("PRAGMA synchronous"),
        ]),
    );
    const t0 = Date.now();
    const long = prisma.$transaction(
        async (tx) => {
            await tx.dataBackfill.create({ data: { name: "L" + Math.random() } });
            await new Promise((r) => setTimeout(r, +process.argv[3]));
        },
        { timeout: 10000 },
    );
    await new Promise((r) => setTimeout(r, 100));
    const readT = Date.now();
    const read = prisma.user.count().then(
        () => Date.now() - readT,
        (e) => "ERR " + e.code,
    );
    const txT = Date.now();
    const second = prisma
        .$transaction(async (tx) => tx.user.count())
        .then(
            () => Date.now() - txT,
            (e) => "ERR " + e.code + " " + e.message.split("\n").pop(),
        );
    const writeT = Date.now();
    const write = prisma.dataBackfill.create({ data: { name: "W" + Math.random() } }).then(
        () => Date.now() - writeT,
        (e) => "ERR " + e.code + " " + e.message.split("\n").pop(),
    );
    console.log("plain read latency during long tx:", await read);
    console.log("2nd interactive tx (default maxWait 2s):", await second);
    console.log("plain write latency during long tx:", await write);
    await long;
    console.log("total", Date.now() - t0);
    await prisma.$disconnect();
})();
