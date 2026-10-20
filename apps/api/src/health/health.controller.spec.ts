import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";

describe("HealthController", () => {
    let controller: HealthController;
    let prisma: { $queryRaw: jest.Mock };

    beforeEach(async () => {
        prisma = { $queryRaw: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [{ provide: PrismaService, useValue: prisma }],
        }).compile();

        controller = module.get<HealthController>(HealthController);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("returns ok when the database responds", async () => {
        prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

        await expect(controller.check()).resolves.toEqual({ status: "ok", database: "ok" });
    });

    it("throws 503 when the database query rejects", async () => {
        prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));

        const error = await controller.check().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getStatus()).toBe(503);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
            status: "error",
            database: "unreachable",
        });
    });

    it("throws 503 when the database does not respond within 2 seconds", async () => {
        jest.useFakeTimers();
        prisma.$queryRaw.mockReturnValue(new Promise(() => {}));

        const pending = controller.check().catch((e: unknown) => e);
        jest.advanceTimersByTime(2000);
        const error = await pending;

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    });

    it("clears the timeout timer once the database responds", async () => {
        jest.useFakeTimers();
        prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

        await controller.check();

        expect(jest.getTimerCount()).toBe(0);
    });
});
