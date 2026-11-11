import { resolve } from "node:path";
import type { Page } from "@playwright/test";

// Shared by the Playwright config (which starts the API) and the specs (which talk to it).

export const E2E_PORT = Number(process.env.E2E_PORT ?? 8091);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const DATABASE_URL =
    process.env.E2E_DATABASE_URL ?? "postgresql://badger:badger_password@localhost:5433/badger_e2e";

export const E2E_DIR = resolve(__dirname, "..");
export const ROOT_DIR = resolve(E2E_DIR, "..");
export const API_DIR = resolve(ROOT_DIR, "apps/api");
export const BUILDS_DIR = resolve(E2E_DIR, ".builds");
export const CURRENT_BUILD_DIR = resolve(BUILDS_DIR, "current");
export const DATA_DIR = resolve(E2E_DIR, ".data");

/** Opens the app and waits until its service worker controls the page. */
export async function waitForServiceWorker(page: Page): Promise<void> {
    await page.goto("/");
    // The first load only installs the worker; a reload lets it take control of the page.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
