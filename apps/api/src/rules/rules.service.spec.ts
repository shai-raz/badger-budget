import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRuleDto, RuleConditionDto, RulePreviewDto, UpdateRuleDto } from "./dto/rule.dto";
import { RulesService } from "./rules.service";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RULE_ID = "11111111-1111-4111-8111-111111111111";
const RULE_B_ID = "22222222-2222-4222-8222-222222222222";
const RULE_C_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const CATEGORY_ID = "55555555-5555-4555-8555-555555555555";

const mockPrisma = {
    rule: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    ruleCondition: { deleteMany: jest.fn(), createMany: jest.fn() },
    ruleAction: { deleteMany: jest.fn(), createMany: jest.fn() },
    account: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    transaction: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
};

function ruleRow(overrides: Record<string, unknown> = {}) {
    return {
        id: RULE_ID,
        userId: USER_ID,
        name: "Coffee",
        priority: 1,
        stopOnMatch: false,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        deletedAt: null,
        conditions: [
            { id: "c1", ruleId: RULE_ID, field: "description", operator: "contains", value: "starbucks", position: 0 },
        ],
        actions: [{ id: "a1", ruleId: RULE_ID, type: "set_category", value: CATEGORY_ID, position: 0 }],
        ...overrides,
    };
}

const validCreate = (overrides: Partial<CreateRuleDto> = {}): CreateRuleDto => ({
    name: "Coffee",
    conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
    actions: [{ type: "set_category", value: CATEGORY_ID }],
    ...overrides,
});

const validUpdate = (overrides: Partial<UpdateRuleDto> = {}): UpdateRuleDto => ({
    name: "Coffee",
    conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
    actions: [{ type: "set_category", value: CATEGORY_ID }],
    stopOnMatch: false,
    ...overrides,
});

describe("RulesService", () => {
    let service: RulesService;

    beforeEach(async () => {
        jest.resetAllMocks();
        mockPrisma.$transaction.mockImplementation((arg: unknown) =>
            typeof arg === "function" ? arg(mockPrisma) : Promise.all(arg as Promise<unknown>[]),
        );
        mockPrisma.account.findMany.mockResolvedValue([{ id: ACCOUNT_ID }]);
        mockPrisma.category.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);
        mockPrisma.rule.findFirst.mockResolvedValue(null);
        mockPrisma.rule.create.mockResolvedValue(ruleRow());

        const module: TestingModule = await Test.createTestingModule({
            providers: [RulesService, { provide: PrismaService, useValue: mockPrisma }],
        }).compile();

        service = module.get<RulesService>(RulesService);
    });

    describe("create", () => {
        it("assigns the priority after the user's last live rule", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue({ priority: 4 });

            await service.create(USER_ID, validCreate());

            expect(mockPrisma.rule.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER_ID, deletedAt: null } }),
            );
            expect(mockPrisma.rule.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ priority: 5 }) }),
            );
        });

        it("starts at priority 1 when the user has no rules", async () => {
            await service.create(USER_ID, validCreate());

            expect(mockPrisma.rule.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ priority: 1 }) }),
            );
        });

        it("defaults stopOnMatch to false, starts active and stores positions from the index", async () => {
            await service.create(
                USER_ID,
                validCreate({
                    conditions: [
                        { field: "description", operator: "contains", value: "starbucks" },
                        { field: "amount", operator: "greaterThan", value: "50" },
                    ],
                }),
            );

            const data = mockPrisma.rule.create.mock.calls[0][0].data;
            expect(data.stopOnMatch).toBe(false);
            expect(data.isActive).toBe(true);
            expect(data.userId).toBe(USER_ID);
            expect(data.conditions.create).toEqual([
                { field: "description", operator: "contains", value: "starbucks", position: 0 },
                { field: "amount", operator: "greaterThan", value: "50", position: 1 },
            ]);
            expect(data.actions.create).toEqual([{ type: "set_category", value: CATEGORY_ID, position: 0 }]);
        });

        it("keeps an explicit stopOnMatch", async () => {
            await service.create(USER_ID, validCreate({ stopOnMatch: true }));

            expect(mockPrisma.rule.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ stopOnMatch: true }) }),
            );
        });

        it("returns the saved rule with appliedCount null", async () => {
            const result = await service.create(USER_ID, validCreate());

            expect(result.appliedCount).toBeNull();
            expect(result.rule.id).toBe(RULE_ID);
            expect(result.rule.conditions).toHaveLength(1);
        });

        it("stores the name and values trimmed", async () => {
            await service.create(
                USER_ID,
                validCreate({
                    name: "  Coffee  ",
                    conditions: [{ field: "description", operator: "contains", value: "  starbucks " }],
                }),
            );

            const data = mockPrisma.rule.create.mock.calls[0][0].data;
            expect(data.name).toBe("Coffee");
            expect(data.conditions.create[0].value).toBe("starbucks");
        });

        it("rejects a name that is only spaces", async () => {
            await expect(service.create(USER_ID, validCreate({ name: "   " }))).rejects.toThrow(BadRequestException);
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });

        it.each<[string, RuleConditionDto]>([
            ["an amount with a text operator", { field: "amount", operator: "contains", value: "5" }],
            ["a description with an amount operator", { field: "description", operator: "greaterThan", value: "5" }],
            ["a type with a text operator", { field: "type", operator: "startsWith", value: "expense" }],
            ["an account with an amount operator", { field: "account", operator: "lessThan", value: ACCOUNT_ID }],
        ])("rejects %s", async (_name, condition) => {
            const dto = validCreate({ conditions: [{ ...condition }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });

        it.each(["12.345", "-5", "abc", "", "1,000"])("rejects the amount value %j", async (value) => {
            const dto = validCreate({ conditions: [{ field: "amount", operator: "greaterThan", value }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });

        it("accepts an amount with up to two decimals", async () => {
            await service.create(
                USER_ID,
                validCreate({ conditions: [{ field: "amount", operator: "equals", value: "12.5" }] }),
            );

            expect(mockPrisma.rule.create).toHaveBeenCalled();
        });

        it("rejects a type value that is not a transaction type", async () => {
            const dto = validCreate({ conditions: [{ field: "type", operator: "equals", value: "savings" }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
        });

        it("rejects an empty text value", async () => {
            const dto = validCreate({ conditions: [{ field: "originalCategory", operator: "equals", value: "   " }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
        });

        it("rejects an account the user does not own or that is deleted", async () => {
            mockPrisma.account.findMany.mockResolvedValue([]);
            const dto = validCreate({ conditions: [{ field: "account", operator: "equals", value: ACCOUNT_ID }] });

            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);

            expect(mockPrisma.account.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: { in: [ACCOUNT_ID] }, userId: USER_ID, deletedAt: null },
                }),
            );
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });

        it("rejects an account value that is not a UUID without querying", async () => {
            const dto = validCreate({ conditions: [{ field: "account", operator: "equals", value: "checking" }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
        });

        it("accepts a valid account of the user", async () => {
            const dto = validCreate({ conditions: [{ field: "account", operator: "equals", value: ACCOUNT_ID }] });
            await service.create(USER_ID, dto);

            expect(mockPrisma.rule.create).toHaveBeenCalled();
        });

        it("rejects a category the user does not own or that is deleted", async () => {
            mockPrisma.category.findMany.mockResolvedValue([]);

            await expect(service.create(USER_ID, validCreate())).rejects.toThrow(BadRequestException);

            expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        id: { in: [CATEGORY_ID] },
                        deletedAt: null,
                        OR: [{ isSystem: true }, { userId: USER_ID }],
                    },
                }),
            );
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });

        it("rejects a set_category value that is not a UUID without querying", async () => {
            const dto = validCreate({ actions: [{ type: "set_category", value: "Food" }] });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
        });

        it("accepts a system category", async () => {
            mockPrisma.category.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);

            await service.create(USER_ID, validCreate());

            expect(mockPrisma.rule.create).toHaveBeenCalled();
        });

        it("rejects two set_category actions", async () => {
            const dto = validCreate({
                actions: [
                    { type: "set_category", value: CATEGORY_ID },
                    { type: "set_category", value: CATEGORY_ID },
                ],
            });
            await expect(service.create(USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.rule.create).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        beforeEach(() => {
            mockPrisma.rule.findFirst.mockResolvedValue({ id: RULE_ID });
            mockPrisma.rule.update.mockResolvedValue(ruleRow({ stopOnMatch: true, name: "Renamed" }));
        });

        it("replaces the conditions and actions inside one transaction", async () => {
            const dto = validUpdate({
                name: "Renamed",
                stopOnMatch: true,
                conditions: [
                    { field: "description", operator: "startsWith", value: "star" },
                    { field: "type", operator: "equals", value: "expense" },
                ],
            });

            const result = await service.update(RULE_ID, USER_ID, dto);

            expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
            expect(mockPrisma.ruleCondition.deleteMany).toHaveBeenCalledWith({ where: { ruleId: RULE_ID } });
            expect(mockPrisma.ruleAction.deleteMany).toHaveBeenCalledWith({ where: { ruleId: RULE_ID } });
            expect(mockPrisma.ruleCondition.createMany).toHaveBeenCalledWith({
                data: [
                    { field: "description", operator: "startsWith", value: "star", ruleId: RULE_ID, position: 0 },
                    { field: "type", operator: "equals", value: "expense", ruleId: RULE_ID, position: 1 },
                ],
            });
            expect(mockPrisma.ruleAction.createMany).toHaveBeenCalledWith({
                data: [{ type: "set_category", value: CATEGORY_ID, ruleId: RULE_ID, position: 0 }],
            });
            expect(mockPrisma.rule.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: RULE_ID }, data: { name: "Renamed", stopOnMatch: true } }),
            );
            expect(result.appliedCount).toBeNull();
            expect(result.rule.stopOnMatch).toBe(true);
        });

        it("throws NotFound and writes nothing for a rule of another user", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue(null);

            await expect(service.update(RULE_ID, USER_ID, validUpdate())).rejects.toThrow(NotFoundException);
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });

        it("validates the draft before touching the rule", async () => {
            const dto = validUpdate({ conditions: [{ field: "amount", operator: "greaterThan", value: "1.234" }] });

            await expect(service.update(RULE_ID, USER_ID, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe("setActive", () => {
        it("turns the rule off and returns it", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue({ id: RULE_ID });
            mockPrisma.rule.update.mockResolvedValue(ruleRow({ isActive: false }));

            const rule = await service.setActive(RULE_ID, USER_ID, false);

            expect(mockPrisma.rule.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: RULE_ID }, data: { isActive: false } }),
            );
            expect(rule.isActive).toBe(false);
        });

        it("throws NotFound for a rule of another user", async () => {
            await expect(service.setActive(RULE_ID, USER_ID, true)).rejects.toThrow(NotFoundException);
            expect(mockPrisma.rule.update).not.toHaveBeenCalled();
        });
    });

    describe("reorder", () => {
        beforeEach(() => {
            mockPrisma.rule.findMany.mockResolvedValue([{ id: RULE_ID }, { id: RULE_B_ID }, { id: RULE_C_ID }]);
        });

        it("reads only the live rules of this user", async () => {
            await service.reorder(USER_ID, [RULE_ID, RULE_B_ID, RULE_C_ID]);

            expect(mockPrisma.rule.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER_ID, deletedAt: null } }),
            );
        });

        it("returns 409 when an id is missing", async () => {
            await expect(service.reorder(USER_ID, [RULE_ID, RULE_B_ID])).rejects.toThrow(ConflictException);
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });

        it("returns 409 when an unknown id is included", async () => {
            const unknown = "66666666-6666-4666-8666-666666666666";

            await expect(service.reorder(USER_ID, [RULE_ID, RULE_B_ID, RULE_C_ID, unknown])).rejects.toThrow(
                ConflictException,
            );
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });

        it("returns 409 when an id is duplicated", async () => {
            await expect(service.reorder(USER_ID, [RULE_ID, RULE_ID, RULE_C_ID])).rejects.toThrow(ConflictException);
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        });

        it("writes dense priorities 1..n in the new order", async () => {
            await service.reorder(USER_ID, [RULE_C_ID, RULE_ID, RULE_B_ID]);

            expect(mockPrisma.rule.update.mock.calls).toEqual([
                [{ where: { id: RULE_C_ID }, data: { priority: 1 } }],
                [{ where: { id: RULE_ID }, data: { priority: 2 } }],
                [{ where: { id: RULE_B_ID }, data: { priority: 3 } }],
            ]);
            expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
        });
    });

    describe("remove", () => {
        it("soft deletes by setting deletedAt and keeps the row", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue({ id: RULE_ID });

            await service.remove(RULE_ID, USER_ID);

            expect(mockPrisma.rule.update).toHaveBeenCalledWith({
                where: { id: RULE_ID },
                data: { deletedAt: expect.any(Date) },
            });
        });

        it("throws NotFound for a rule of another user", async () => {
            await expect(service.remove(RULE_ID, USER_ID)).rejects.toThrow(NotFoundException);
            expect(mockPrisma.rule.update).not.toHaveBeenCalled();
        });
    });

    describe("reads", () => {
        it("lists live rules in priority order, then creation order", async () => {
            mockPrisma.rule.findMany.mockResolvedValue([ruleRow()]);

            const rules = await service.findAll(USER_ID);

            expect(mockPrisma.rule.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: USER_ID, deletedAt: null },
                    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
                }),
            );
            expect(rules).toHaveLength(1);
            expect(rules[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
        });

        it("finds one rule only among live rules", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue(ruleRow());

            const rule = await service.findOne(RULE_ID, USER_ID);

            expect(mockPrisma.rule.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: RULE_ID, userId: USER_ID, deletedAt: null } }),
            );
            expect(rule.id).toBe(RULE_ID);
        });

        it("throws NotFound when the rule is missing or deleted", async () => {
            await expect(service.findOne(RULE_ID, USER_ID)).rejects.toThrow(NotFoundException);
        });

        it("drops stored conditions and actions that are no longer valid", async () => {
            mockPrisma.rule.findFirst.mockResolvedValue(
                ruleRow({
                    conditions: [
                        {
                            id: "ok",
                            ruleId: RULE_ID,
                            field: "description",
                            operator: "contains",
                            value: "x",
                            position: 0,
                        },
                        {
                            id: "bad-field",
                            ruleId: RULE_ID,
                            field: "legacy",
                            operator: "contains",
                            value: "x",
                            position: 1,
                        },
                        {
                            id: "bad-op",
                            ruleId: RULE_ID,
                            field: "amount",
                            operator: "contains",
                            value: "5",
                            position: 2,
                        },
                    ],
                    actions: [{ id: "bad-type", ruleId: RULE_ID, type: "archive", value: "x", position: 0 }],
                }),
            );

            const rule = await service.findOne(RULE_ID, USER_ID);

            expect(rule.conditions.map((c) => c.id)).toEqual(["ok"]);
            expect(rule.actions).toEqual([]);
        });
    });
    describe("preview, apply and save and apply", () => {
        const CATEGORY_B_ID = "77777777-7777-4777-8777-777777777777";
        const preview: RulePreviewDto = {
            conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
            actions: [{ type: "set_category", value: CATEGORY_ID }],
        };

        function txId(n: number): string {
            return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
        }

        function txRow(n: number, overrides: Record<string, unknown> = {}) {
            return {
                id: txId(n),
                description: "Starbucks",
                originalCategory: null,
                amount: -12.5,
                accountId: ACCOUNT_ID,
                type: "expense",
                categoryId: null,
                transactionDate: new Date("2026-02-01T00:00:00.000Z"),
                createdAt: new Date("2026-02-01T10:00:00.000Z"),
                ...overrides,
            };
        }

        /** Answers the candidate query (no id filter) with every row, and the page detail query with the matching rows. */
        function givenTransactions(rows: ReturnType<typeof txRow>[]) {
            mockPrisma.transaction.findMany.mockImplementation(
                async ({ where }: { where: { id?: { in: string[] } } }) => {
                    if (!where.id) return rows;
                    const wanted = new Set(where.id.in);
                    return rows
                        .filter((row) => wanted.has(row.id))
                        .map((row) => ({
                            id: row.id,
                            description: row.description,
                            transactionDate: row.transactionDate,
                            amount: row.amount,
                            currency: { code: "ILS" },
                            account: { name: "Checking" },
                            category: row.categoryId
                                ? { id: row.categoryId, name: "Food", color: "#ff0000", icon: null }
                                : null,
                        }));
                },
            );
        }

        // Matched rows: 1 uncategorized, 2 in another category, 3 already in the target, 4 not matched.
        const fourRows = () => [
            txRow(1, { categoryId: null }),
            txRow(2, { description: "Starbucks Reserve", categoryId: CATEGORY_B_ID }),
            txRow(3, { categoryId: CATEGORY_ID }),
            txRow(4, { description: "Shell", categoryId: null }),
        ];

        beforeEach(() => {
            mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });
        });

        describe("preview", () => {
            it("counts matches, would-change and already-target rows, and lists only rows that would change", async () => {
                givenTransactions(fourRows());

                const result = await service.preview(USER_ID, preview);

                expect(result.matchCount).toBe(3);
                expect(result.wouldChangeCount).toBe(2);
                expect(result.alreadyTargetCount).toBe(1);
                expect(result.counts).toEqual({ all: 2, uncategorized: 1, categorized: 1 });
                expect(result.items.map((item) => item.id)).toEqual([txId(1), txId(2)]);
                expect(result.page).toBe(1);
                expect(result.totalPages).toBe(1);
            });

            it("reads only live transactions and never mirror rows of linked transfers", async () => {
                givenTransactions([]);

                await service.preview(USER_ID, preview);

                expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: { userId: USER_ID, deletedAt: null, counterpartOfId: null },
                    }),
                );
            });

            it("filters the items but keeps the counts and totals", async () => {
                givenTransactions(fourRows());

                const result = await service.preview(USER_ID, { ...preview, filter: "uncategorized" });

                expect(result.items.map((item) => item.id)).toEqual([txId(1)]);
                expect(result.counts).toEqual({ all: 2, uncategorized: 1, categorized: 1 });
                expect(result.wouldChangeCount).toBe(2);
            });

            it("searches the description case-insensitively, then counts what is left", async () => {
                givenTransactions(fourRows());

                const result = await service.preview(USER_ID, { ...preview, search: "  RESERVE " });

                expect(result.items.map((item) => item.id)).toEqual([txId(2)]);
                expect(result.counts).toEqual({ all: 1, uncategorized: 0, categorized: 1 });
                expect(result.matchCount).toBe(3);
                expect(result.wouldChangeCount).toBe(2);
            });

            it("orders newest first by transaction date, then creation time, then id", async () => {
                givenTransactions([
                    txRow(1, { transactionDate: new Date("2026-01-01T00:00:00.000Z") }),
                    txRow(2, {
                        transactionDate: new Date("2026-03-01T00:00:00.000Z"),
                        createdAt: new Date("2026-01-01T00:00:00.000Z"),
                    }),
                    txRow(3, {
                        transactionDate: new Date("2026-03-01T00:00:00.000Z"),
                        createdAt: new Date("2026-03-02T00:00:00.000Z"),
                    }),
                ]);

                const result = await service.preview(USER_ID, preview);

                expect(result.items.map((item) => item.id)).toEqual([txId(3), txId(2), txId(1)]);
            });

            it("pages 50 rows at a time, so 51 matches give two pages", async () => {
                givenTransactions(Array.from({ length: 51 }, (_, index) => txRow(index + 1)));

                const first = await service.preview(USER_ID, preview);
                const second = await service.preview(USER_ID, { ...preview, page: 2 });

                expect(first.matchCount).toBe(51);
                expect(first.totalPages).toBe(2);
                expect(first.items).toHaveLength(50);
                expect(second.page).toBe(2);
                expect(second.items).toHaveLength(1);
                expect(second.items[0].id).toBe(txId(51));
            });

            it("returns one empty page when nothing matches", async () => {
                givenTransactions([txRow(1, { description: "Shell" })]);

                const result = await service.preview(USER_ID, preview);

                expect(result.items).toEqual([]);
                expect(result.counts).toEqual({ all: 0, uncategorized: 0, categorized: 0 });
                expect(result.totalPages).toBe(1);
                expect(mockPrisma.transaction.findMany).toHaveBeenCalledTimes(1);
            });

            it("maps each item with its account, currency, type and category", async () => {
                givenTransactions([txRow(1, { categoryId: null })]);

                const [item] = (await service.preview(USER_ID, preview)).items;

                expect(item).toEqual({
                    id: txId(1),
                    description: "Starbucks",
                    transactionDate: "2026-02-01",
                    amount: -12.5,
                    type: "expense",
                    currencyCode: "ILS",
                    accountName: "Checking",
                    category: null,
                });
            });

            it("validates the draft before reading any transaction", async () => {
                const bad: RulePreviewDto = {
                    conditions: [{ field: "amount", operator: "contains", value: "5" }],
                    actions: [{ type: "set_category", value: CATEGORY_ID }],
                };

                await expect(service.preview(USER_ID, bad)).rejects.toThrow(BadRequestException);
                expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
            });
        });

        describe("apply", () => {
            beforeEach(() => {
                mockPrisma.rule.findFirst.mockResolvedValue(ruleRow());
                // Row 1 and row 2 would change; row 3 is already in the target; row 4 does not match.
                givenTransactions(fourRows());
                mockPrisma.transaction.updateMany.mockResolvedValue({ count: 2 });
            });

            it("allExcept updates the would-change rows that are not listed", async () => {
                const result = await service.apply(RULE_ID, USER_ID, { mode: "allExcept", ids: [txId(1)] });

                expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
                    where: { id: { in: [txId(2)] }, userId: USER_ID },
                    data: { categoryId: CATEGORY_ID },
                });
                expect(result).toEqual({ count: 2 });
            });

            it("only updates the listed rows that would change and ignores any other id", async () => {
                await service.apply(RULE_ID, USER_ID, {
                    mode: "only",
                    ids: [txId(1), txId(3), txId(4), txId(99)],
                });

                expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
                    where: { id: { in: [txId(1)] }, userId: USER_ID },
                    data: { categoryId: CATEGORY_ID },
                });
            });

            it("never touches already-target rows when allExcept lists nothing", async () => {
                await service.apply(RULE_ID, USER_ID, { mode: "allExcept", ids: [] });

                expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
                    where: { id: { in: [txId(1), txId(2)] }, userId: USER_ID },
                    data: { categoryId: CATEGORY_ID },
                });
            });

            it("writes nothing and returns zero when the selection is empty", async () => {
                const result = await service.apply(RULE_ID, USER_ID, { mode: "only", ids: [] });

                expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
                expect(result).toEqual({ count: 0 });
            });

            it("throws NotFound for a rule of another user", async () => {
                mockPrisma.rule.findFirst.mockResolvedValue(null);

                await expect(service.apply(RULE_ID, USER_ID, { mode: "allExcept", ids: [] })).rejects.toThrow(
                    NotFoundException,
                );
                expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
            });

            it("rejects with 400 and writes nothing when the rule's category was deleted", async () => {
                mockPrisma.category.findMany.mockResolvedValue([]);

                await expect(service.apply(RULE_ID, USER_ID, { mode: "allExcept", ids: [] })).rejects.toThrow(
                    BadRequestException,
                );
                expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
            });

            it("rejects with 400 and writes nothing when a stored set_category row was dropped as invalid", async () => {
                mockPrisma.rule.findFirst.mockResolvedValue(
                    ruleRow({
                        actions: [
                            { id: "a1", ruleId: RULE_ID, type: "retired_action", value: CATEGORY_ID, position: 0 },
                        ],
                    }),
                );

                await expect(service.apply(RULE_ID, USER_ID, { mode: "allExcept", ids: [] })).rejects.toThrow(
                    BadRequestException,
                );
                expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
            });
        });

        describe("save and apply", () => {
            beforeEach(() => {
                givenTransactions([txRow(1)]);
                mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
                mockPrisma.rule.update.mockResolvedValue(ruleRow());
            });

            it("create with apply runs the save and the update in one transaction with a 60 second timeout", async () => {
                const result = await service.create(USER_ID, validCreate({ apply: { mode: "allExcept", ids: [] } }));

                expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
                expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
                expect(mockPrisma.rule.create).toHaveBeenCalled();
                expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
                    where: { id: { in: [txId(1)] }, userId: USER_ID },
                    data: { categoryId: CATEGORY_ID },
                });
                expect(result.appliedCount).toBe(1);
                expect(result.rule.id).toBe(RULE_ID);
            });

            it("create without apply keeps the plain path and returns appliedCount null", async () => {
                const result = await service.create(USER_ID, validCreate());

                expect(mockPrisma.$transaction).not.toHaveBeenCalled();
                expect(mockPrisma.transaction.updateMany).not.toHaveBeenCalled();
                expect(result.appliedCount).toBeNull();
            });

            it("create rejects when the apply write fails, so the save is rolled back", async () => {
                mockPrisma.transaction.updateMany.mockRejectedValue(new Error("write failed"));

                await expect(
                    service.create(USER_ID, validCreate({ apply: { mode: "allExcept", ids: [] } })),
                ).rejects.toThrow("write failed");
                expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
            });

            it("update with apply replaces the rule and applies it inside one transaction", async () => {
                mockPrisma.rule.findFirst.mockResolvedValue({ id: RULE_ID });

                const result = await service.update(
                    RULE_ID,
                    USER_ID,
                    validUpdate({ apply: { mode: "allExcept", ids: [] } }),
                );

                expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
                expect(mockPrisma.ruleCondition.deleteMany).toHaveBeenCalled();
                expect(mockPrisma.transaction.updateMany).toHaveBeenCalled();
                expect(result.appliedCount).toBe(1);
            });

            it("update rejects when the apply write fails", async () => {
                mockPrisma.rule.findFirst.mockResolvedValue({ id: RULE_ID });
                mockPrisma.transaction.updateMany.mockRejectedValue(new Error("write failed"));

                await expect(
                    service.update(RULE_ID, USER_ID, validUpdate({ apply: { mode: "allExcept", ids: [] } })),
                ).rejects.toThrow("write failed");
            });
        });
    });
});
