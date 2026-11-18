// Prisma 7 + @prisma/adapter-libsql: storage format and blocking behind an open transaction. Run: node libsql-prisma7.js '' 7000
// Setup: see docs/research/sqlite-default-database.md, Appendix.
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const fmt = process.argv[2];
const adapter = new PrismaLibSql({ url: "file:./dev.db" }, fmt ? { timestampFormat: fmt } : undefined);
const p = new PrismaClient({ adapter });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    console.log("timestampFormat:", fmt || "(default)");
    const u = await p.user.create({ data: { email: Math.random() + "@x", firstName: "a", lastName: "b" } });
    const cur = await p.currency.upsert({
        where: { code: "ILS" },
        create: { code: "ILS", symbol: "s", name: "n" },
        update: {},
    });
    const acc = await p.account.create({ data: { userId: u.id, name: "A", type: "bank" } });
    await p.transaction.create({
        data: {
            userId: u.id,
            accountId: acc.id,
            currencyId: cur.id,
            type: "expense",
            amount: "0.1",
            description: "Coffee",
            transactionDate: new Date("2026-11-18T15:30:00Z"),
        },
    });
    console.log(
        "storage:",
        await p.$queryRawUnsafe(
            `SELECT typeof(transaction_date) t, transaction_date v, typeof(amount) at FROM transactions ORDER BY rowid DESC LIMIT 1`,
        ),
    );
    try {
        console.log(
            "mode insensitive:",
            await p.transaction.count({ where: { description: { contains: "coffee", mode: "insensitive" } } }),
        );
    } catch (e) {
        console.log("mode insensitive ERR:", e.message.split("\n").filter(Boolean).pop());
    }
    console.log("contains lower ascii:", await p.transaction.count({ where: { description: { contains: "coffee" } } }));
    // concurrency
    const t0 = Date.now();
    const long = p.$transaction(
        async (tx) => {
            await tx.dataBackfill.create({ data: { name: "L" + Math.random() } });
            await sleep(+process.argv[3] || 3000);
        },
        { timeout: 20000 },
    );
    await sleep(100);
    const r0 = Date.now();
    const read = p.user.count().then(
        () => Date.now() - r0,
        (e) => "ERR " + e.message.split("\n").pop(),
    );
    const w0 = Date.now();
    const write = p.dataBackfill.create({ data: { name: "W" + Math.random() } }).then(
        () => Date.now() - w0,
        (e) => "ERR " + (e.code || "") + " " + e.message.split("\n").pop(),
    );
    const x0 = Date.now();
    const tx2 = p
        .$transaction(async (tx) => {
            const n = await tx.user.count();
            await tx.dataBackfill.create({ data: { name: "T" + Math.random() } });
            return n;
        })
        .then(
            () => Date.now() - x0,
            (e) => "ERR " + (e.code || "") + " " + e.message.split("\n").pop(),
        );
    console.log("read during long tx:", await read, "| write:", await write, "| 2nd tx:", await tx2);
    await long.catch((e) => console.log("long ERR", e.message));
    console.log("total", Date.now() - t0);
    await p.$disconnect();
})().catch((e) => console.log("FATAL", e.message));
