import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { resolveDataDir } from "./config/data-dir";
import { resolveSecrets } from "./config/secrets";

async function bootstrap() {
    // Must run before NestFactory.create: the JWT and credential-crypto providers read these at construction.
    // AppModule's ConfigModule has already loaded .env at import time, so values from .env take precedence.
    resolveSecrets({ env: process.env, dataDir: resolveDataDir(), logger: new Logger("Secrets") });

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    configureApp(app);

    // Swagger documentation
    const config = new DocumentBuilder()
        .setTitle("Badger Budget API")
        .setDescription("Personal budgeting and expense tracking API")
        .setVersion("1.0")
        .addBearerAuth()
        .addTag("auth", "Authentication endpoints")
        .addTag("users", "User management")
        .addTag("accounts", "Financial accounts")
        .addTag("categories", "Expense categories")
        .addTag("budgets", "Budget management")
        .addTag("transactions", "Transaction tracking")
        .addTag("reports", "Analytics and reports")
        .addTag("oauth", "OAuth 2.1 authorization server for MCP clients")
        .addTag("mcp", "MCP server (JSON-RPC over Streamable HTTP) for LLM clients")
        .addTag("health", "Liveness/readiness")
        .addTag("config", "Public instance configuration")
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
    console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
