import { PrismaService } from "../prisma/prisma.service";
import { InstanceStateService } from "./instance-state.service";

describe("InstanceStateService", () => {
    let prisma: { instanceState: { findUnique: jest.Mock; upsert: jest.Mock } };
    let service: InstanceStateService;

    beforeEach(() => {
        prisma = { instanceState: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) } };
        service = new InstanceStateService(prisma as unknown as PrismaService);
    });

    it("returns null for a key that was never set", async () => {
        prisma.instanceState.findUnique.mockResolvedValue(null);

        await expect(service.get("update-notifier.last-notified-version")).resolves.toBeNull();
    });

    it("returns the stored JSON value", async () => {
        prisma.instanceState.findUnique.mockResolvedValue({ value: { version: "0.4.0" } });

        await expect(service.get("update-notifier.last-notified-version")).resolves.toEqual({ version: "0.4.0" });
        expect(prisma.instanceState.findUnique).toHaveBeenCalledWith({
            where: { key: "update-notifier.last-notified-version" },
            select: { value: true },
        });
    });

    it("upserts the value under its key", async () => {
        await service.set("update-notifier.last-notified-version", { version: "0.4.0" });

        expect(prisma.instanceState.upsert).toHaveBeenCalledWith({
            where: { key: "update-notifier.last-notified-version" },
            create: { key: "update-notifier.last-notified-version", value: { version: "0.4.0" } },
            update: { value: { version: "0.4.0" } },
        });
    });
});
