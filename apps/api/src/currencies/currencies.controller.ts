import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { CurrenciesService } from "./currencies.service";

@ApiTags("currencies")
@Controller("currencies")
export class CurrenciesController {
    constructor(private readonly currenciesService: CurrenciesService) {}

    @Get()
    @ApiOperation({ summary: "Get all available currencies" })
    @ApiResponse({ status: 200, description: "List of currencies" })
    findAll() {
        return this.currenciesService.findAll();
    }

    @Get(":id")
    @ApiOperation({ summary: "Get currency by ID" })
    @ApiResponse({ status: 200, description: "Currency found" })
    @ApiResponse({ status: 404, description: "Currency not found" })
    findOne(@Param("id") id: string) {
        return this.currenciesService.findOne(id);
    }

    @Get("code/:code")
    @ApiOperation({ summary: "Get currency by code (e.g., USD, EUR)" })
    @ApiResponse({ status: 200, description: "Currency found" })
    @ApiResponse({ status: 404, description: "Currency not found" })
    findByCode(@Param("code") code: string) {
        return this.currenciesService.findByCode(code);
    }
}
