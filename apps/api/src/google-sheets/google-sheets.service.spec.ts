import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sheets as sheetsClient } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";
import { GoogleSheetsService } from "./google-sheets.service";
import { PrismaService } from "../prisma/prisma.service";
import { CardPayoffPatternsService } from "../card-payoff-patterns/card-payoff-patterns.service";
import { TransactionImportService } from "../transactions/transaction-import.service";

jest.mock("@googleapis/sheets", () => ({ sheets: jest.fn() }));
jest.mock("google-auth-library", () => ({ GoogleAuth: jest.fn() }));

describe("GoogleSheetsService", () => {
    let service: GoogleSheetsService;
    let valuesGet: jest.Mock;

    const mockPrismaService = {
        sheetConnection: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    };

    // Plain function, not jest.fn(): afterEach resetAllMocks would wipe a jest.fn implementation.
    const sheetsEnv: Record<string, string> = {
        GOOGLE_SHEETS_TYPE: "service_account",
        GOOGLE_SHEETS_PRIVATE_KEY: "line1\\nline2",
        GOOGLE_SHEETS_CLIENT_EMAIL: "sheets@example.iam.gserviceaccount.com",
    };
    const mockConfigService = { get: (key: string) => sheetsEnv[key] };

    beforeEach(async () => {
        valuesGet = jest.fn();
        (sheetsClient as unknown as jest.Mock).mockReturnValue({ spreadsheets: { values: { get: valuesGet } } });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GoogleSheetsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: CardPayoffPatternsService, useValue: {} },
                { provide: TransactionImportService, useValue: {} },
            ],
        }).compile();

        service = module.get<GoogleSheetsService>(GoogleSheetsService);
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it("builds the Sheets v4 client from a read-only service-account GoogleAuth", () => {
        expect(GoogleAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                credentials: expect.objectContaining({
                    client_email: "sheets@example.iam.gserviceaccount.com",
                    private_key: "line1\nline2",
                }),
                scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
            }),
        );
        expect(sheetsClient).toHaveBeenCalledWith({
            version: "v4",
            auth: (GoogleAuth as unknown as jest.Mock).mock.instances[0],
        });
    });

    it("connectSheet probes the first cell and creates a connection when the sheet is readable", async () => {
        valuesGet.mockResolvedValue({ data: { values: [["x"]] } });
        mockPrismaService.sheetConnection.findFirst.mockResolvedValue(null);
        mockPrismaService.sheetConnection.create.mockResolvedValue({ id: "conn-1" });

        await service.connectSheet("user-1", "sheet-id", "Sheet1");

        expect(valuesGet).toHaveBeenCalledWith({ spreadsheetId: "sheet-id", range: "Sheet1!A1:A1" });
        expect(mockPrismaService.sheetConnection.create).toHaveBeenCalledWith({
            data: { userId: "user-1", spreadsheetId: "sheet-id", sheetName: "Sheet1" },
        });
    });

    it("connectSheet rejects with a share hint when the Sheets API call fails", async () => {
        valuesGet.mockRejectedValue(new Error("403 forbidden"));

        await expect(service.connectSheet("user-1", "sheet-id")).rejects.toThrow(BadRequestException);
        expect(mockPrismaService.sheetConnection.create).not.toHaveBeenCalled();
    });
});
