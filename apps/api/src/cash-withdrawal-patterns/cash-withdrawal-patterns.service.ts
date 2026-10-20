import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CashWithdrawalPatternsService {
    constructor(private prisma: PrismaService) {}

    /** System patterns plus the caller's own, system first. */
    async findAll(userId: string) {
        return this.prisma.cashWithdrawalPattern.findMany({
            where: { OR: [{ isSystem: true }, { userId }] },
            orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
        });
    }
}
