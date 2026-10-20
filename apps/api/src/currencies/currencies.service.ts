import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CurrenciesService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.currency.findMany({
            orderBy: { code: "asc" },
        });
    }

    async findOne(id: string) {
        const currency = await this.prisma.currency.findUnique({
            where: { id },
        });

        if (!currency) {
            throw new NotFoundException(`Currency with ID ${id} not found`);
        }

        return currency;
    }

    async findByCode(code: string) {
        const currency = await this.prisma.currency.findFirst({
            where: { code },
        });

        if (!currency) {
            throw new NotFoundException(`Currency with code ${code} not found`);
        }

        return currency;
    }
}
