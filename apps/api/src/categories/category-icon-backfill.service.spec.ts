import { Test, TestingModule } from "@nestjs/testing";
import { CategoryIconBackfillService } from "./category-icon-backfill.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CategoryIconBackfillService", () => {
    let service: CategoryIconBackfillService;

    // $transaction hands the callback the same mock, so tx.* and the top-level mock are one spy.
    const tx = {
        dataBackfill: { createMany: jest.fn() },
        category: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    const mockPrismaService = {
        ...tx,
        $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        tx.dataBackfill.createMany.mockResolvedValue({ count: 1 });
        tx.category.findMany.mockResolvedValue([]);
        tx.category.updateMany.mockResolvedValue({ count: 0 });

        const module: TestingModule = await Test.createTestingModule({
            providers: [CategoryIconBackfillService, { provide: PrismaService, useValue: mockPrismaService }],
        }).compile();

        service = module.get<CategoryIconBackfillService>(CategoryIconBackfillService);
        jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);
        jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    });

    it("claims the marker and re-icons matched null/tag categories, leaving unmatched ones alone", async () => {
        tx.category.findMany.mockResolvedValue([
            { id: "groceries-id", name: "Groceries" },
            { id: "xyzzy-id", name: "Xyzzy" },
            { id: "movies-id", name: "Movies" },
        ]);
        tx.category.updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
            count: where.id.in.length,
        }));

        const result = await service.run();

        expect(tx.dataBackfill.createMany).toHaveBeenCalledWith({
            data: [{ name: CategoryIconBackfillService.MARKER }],
            skipDuplicates: true,
        });
        expect(tx.category.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["groceries-id"] } },
            data: { icon: "shopping-cart" },
        });
        expect(tx.category.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["movies-id"] } },
            data: { icon: "film" },
        });
        const updatedIds = tx.category.updateMany.mock.calls.flatMap(
            ([args]: [{ where: { id: { in: string[] } } }]) => args.where.id.in,
        );
        expect(updatedIds).not.toContain("xyzzy-id");
        expect(result).toEqual({ claimed: true, updated: 2 });
    });

    it("only selects user-owned, non-deleted categories whose icon is null or the generic tag", async () => {
        await service.run();

        expect(tx.category.findMany).toHaveBeenCalledWith({
            where: {
                userId: { not: null },
                isSystem: false,
                deletedAt: null,
                OR: [{ icon: null }, { icon: "tag" }],
            },
            select: { id: true, name: true },
        });
    });

    it("groups matched categories per icon, so one icon is one updateMany call", async () => {
        tx.category.findMany.mockResolvedValue([
            { id: "a", name: "Groceries" },
            { id: "b", name: "Supermarket" },
        ]);
        tx.category.updateMany.mockResolvedValue({ count: 2 });

        const result = await service.run();

        expect(tx.category.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.category.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["a", "b"] } },
            data: { icon: "shopping-cart" },
        });
        expect(result).toEqual({ claimed: true, updated: 2 });
    });

    it("is a no-op once the marker exists (second run changes nothing)", async () => {
        tx.dataBackfill.createMany.mockResolvedValue({ count: 0 });

        const result = await service.run();

        expect(tx.category.findMany).not.toHaveBeenCalled();
        expect(tx.category.updateMany).not.toHaveBeenCalled();
        expect(result).toEqual({ claimed: false, updated: 0 });
    });

    it("propagates a failure so the transaction rolls back and the marker is not kept", async () => {
        tx.category.findMany.mockRejectedValue(new Error("db down"));

        await expect(service.run()).rejects.toThrow("db down");
    });

    it("onApplicationBootstrap swallows a failed run and logs it", async () => {
        const failure = new Error("db down");
        jest.spyOn(service, "run").mockRejectedValue(failure);

        expect(() => service.onApplicationBootstrap()).not.toThrow();
        await new Promise((resolve) => setImmediate(resolve));

        expect(service["logger"].error).toHaveBeenCalledWith("Category icon backfill failed", failure);
    });
});
