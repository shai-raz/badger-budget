import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DemoService } from "./demo.service";

@Module({
    imports: [PrismaModule],
    providers: [DemoService],
    exports: [DemoService],
})
export class DemoModule {}
