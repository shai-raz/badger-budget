// Prisma 6 native SQLite: type storage, dates, Decimal, mode/skipDuplicates, raw SQL, concurrency. Run: DATABASE_URL=file:./dev.db node behaviour.js
// Setup: see docs/research/sqlite-default-database.md, Appendix.
// Probes Prisma 6.19.1 + native SQLite behaviour against the Badger schema (derived SQLite variant).
const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();

async function probe(name, fn) {
    try {
        const r = await fn();
        console.log(`\n[${name}] OK:`, typeof r === "string" ? r : JSON.stringify(r, null, 0));
    } catch (e) {
        console.log(
            `\n[${name}] ERROR:`,
            (e.code ? e.code + " " : "") + String(e.message).split("\n").filter(Boolean).slice(-3).join(" | "),
        );
    }
}

(async () => {
    const user = await prisma.user.create({ data: { email: "a@b.c", firstName: "A", lastName: "B" } });
    const cur = await prisma.currency.create({ data: { code: "ILS", symbol: "₪", name: "Shekel" } });
    const acc = await prisma.account.create({
        data: { userId: user.id, name: "Acc", type: "bank", currencyId: cur.id },
    });
    const cat = await prisma.category.create({ data: { userId: user.id, name: "Café", color: "#000000" } });

    await probe("uuid default looks like", async () => user.id);
    await probe("Json default settings", async () => user.settings);
    await probe("enum default role", async () => user.role);

    const mk = (amount, description, transactionDate) =>
        prisma.transaction.create({
            data: {
                userId: user.id,
                accountId: acc.id,
                currencyId: cur.id,
                categoryId: cat.id,
                type: "expense",
                amount,
                description,
                transactionDate,
            },
        });
    await mk("0.1", "Coffee SHOP", new Date("2026-11-18T15:30:00Z"));
    await mk("0.2", "סופר שופרסל", new Date("2026-11-18T00:00:00Z"));
    await mk("12345678901.23", "big", new Date("2026-11-17T00:00:00Z"));

    await probe("@db.Date truncation (wrote 15:30Z)", async () =>
        (await prisma.transaction.findFirst({ where: { description: "Coffee SHOP" } })).transactionDate.toISOString(),
    );
    await probe("raw storage of DateTime", async () =>
        prisma.$queryRawUnsafe(
            `SELECT typeof(transaction_date) t, transaction_date v, typeof(created_at) ct FROM transactions LIMIT 1`,
        ),
    );
    await probe("date equality on day (2026-11-18 midnight)", async () =>
        prisma.transaction.count({ where: { transactionDate: new Date("2026-11-18T00:00:00Z") } }),
    );
    await probe("range lte 2026-11-18 midnight", async () =>
        prisma.transaction.count({ where: { transactionDate: { lte: new Date("2026-11-18T00:00:00Z") } } }),
    );

    await probe("Decimal roundtrip big", async () =>
        (await prisma.transaction.findFirst({ where: { description: "big" } })).amount.toString(),
    );
    await probe("_sum 0.1 + 0.2", async () =>
        (
            await prisma.transaction.aggregate({ where: { amount: { lt: 1 } }, _sum: { amount: true } })
        )._sum.amount.toString(),
    );
    await probe("raw storage of Decimal", async () =>
        prisma.$queryRawUnsafe(`SELECT typeof(amount) t, amount v FROM transactions`),
    );
    await probe("Decimal(20,8) roundtrip 123456789012.12345678", async () => {
        const t = await prisma.transaction.findFirst({ where: { description: "big" } });
        const c = await prisma.transactionConversion.create({
            data: {
                transactionId: t.id,
                targetCurrencyId: cur.id,
                convertedAmount: "123456789012.12345678",
                conversionRate: "3.6512345678",
                rateDate: new Date("2026-11-17"),
            },
        });
        return [c.convertedAmount.toString(), c.conversionRate.toString()];
    });

    await probe("mode: insensitive", async () =>
        prisma.transaction.count({ where: { description: { contains: "coffee", mode: "insensitive" } } }),
    );
    await probe("contains (no mode) ascii case", async () =>
        prisma.transaction.count({ where: { description: { contains: "coffee" } } }),
    );
    await probe("contains non-ascii case (café vs CAFÉ)", async () =>
        prisma.category.count({ where: { name: { contains: "CAFÉ" } } }),
    );
    await probe("contains hebrew", async () =>
        prisma.transaction.count({ where: { description: { contains: "שופרסל" } } }),
    );

    await probe("createMany skipDuplicates", async () =>
        prisma.dataBackfill.createMany({ data: [{ name: "x" }, { name: "x" }], skipDuplicates: true }),
    );
    await probe(
        "createManyAndReturn",
        async () => (await prisma.dataBackfill.createManyAndReturn({ data: [{ name: "y" }] })).length,
    );

    await probe("groupBy _sum", async () =>
        (await prisma.transaction.groupBy({ by: ["categoryId"], _sum: { amount: true } })).map((g) =>
            g._sum.amount.toString(),
        ),
    );
    await probe(
        "distinct",
        async () =>
            (await prisma.transaction.findMany({ distinct: ["currencyId"], select: { currencyId: true } })).length,
    );
    await probe(
        "orderBy nulls last",
        async () =>
            (await prisma.transaction.findMany({ orderBy: { postedDate: { sort: "desc", nulls: "last" } } })).length,
    );

    await probe(
        "Json array (redirectUris)",
        async () =>
            (
                await prisma.oAuthClient.create({
                    data: { clientId: "c1", clientName: "n", redirectUris: ["https://a/cb", "https://b/cb"] },
                })
            ).redirectUris,
    );

    await probe(
        "settings merge via json_patch + RETURNING",
        async () =>
            prisma.$queryRaw`UPDATE users SET settings = json_patch(settings, ${JSON.stringify({ unmatchedImportCategory: "x" })}), updated_at = ${new Date()}
            WHERE id = ${user.id} AND length(CAST(json_patch(settings, ${JSON.stringify({ unmatchedImportCategory: "x" })}) AS BLOB)) <= 4096
            RETURNING settings`,
    );
    await probe(
        "settings read via Prisma after raw write",
        async () => (await prisma.user.findUnique({ where: { id: user.id } })).settings,
    );

    await probe("invalid enum value via raw is accepted?", async () => {
        await prisma.$executeRawUnsafe(`UPDATE users SET role = 'BOGUS' WHERE id = '${user.id}'`);
        return (await prisma.user.findUnique({ where: { id: user.id } })).role;
    });
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'USER' WHERE id = '${user.id}'`);

    await probe("FOR UPDATE syntax", async () =>
        prisma.$queryRawUnsafe(`SELECT id FROM transactions LIMIT 1 FOR UPDATE`),
    );
    await probe("::uuid cast syntax", async () =>
        prisma.$queryRawUnsafe(`SELECT id FROM users WHERE id = '${user.id}'::uuid`),
    );
    await probe("pg_advisory_xact_lock", async () => prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(1)`));

    await probe("sqlite version", async () => prisma.$queryRawUnsafe(`SELECT sqlite_version() v`));
    await probe("journal_mode / busy_timeout / foreign_keys", async () => [
        await prisma.$queryRawUnsafe(`PRAGMA journal_mode`),
        await prisma.$queryRawUnsafe(`PRAGMA busy_timeout`),
        await prisma.$queryRawUnsafe(`PRAGMA foreign_keys`),
    ]);

    // Two interactive transactions that both write, overlapping in time.
    await probe("concurrent interactive write transactions", async () => {
        const slowWrite = (label) =>
            prisma.$transaction(async (tx) => {
                await tx.dataBackfill.create({ data: { name: `c-${label}` } });
                await new Promise((r) => setTimeout(r, 1500));
                return label;
            });
        const t0 = Date.now();
        const r = await Promise.allSettled([slowWrite("a"), slowWrite("b")]);
        return {
            ms: Date.now() - t0,
            r: r.map((x) => x.status + ":" + (x.value ?? String(x.reason?.code ?? x.reason?.message).slice(0, 120))),
        };
    });
    // A read-then-write race (check-then-insert, as in registration) under concurrency.
    await probe("read-then-write race in 2 interactive tx", async () => {
        const go = (label) =>
            prisma.$transaction(async (tx) => {
                const n = await tx.user.count();
                await new Promise((r) => setTimeout(r, 500));
                await tx.user.create({ data: { email: `${label}@x.y`, firstName: "x", lastName: "y" } });
                return `${label} saw ${n}`;
            });
        const r = await Promise.allSettled([go("p"), go("q")]);
        return r.map((x) => x.status + ":" + (x.value ?? String(x.reason?.code ?? x.reason?.message).slice(0, 160)));
    });

    await prisma.$disconnect();
})();
