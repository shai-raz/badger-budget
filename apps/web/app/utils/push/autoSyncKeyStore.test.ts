import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { clearAutoSyncKey, loadAutoSyncKey, saveAutoSyncKey, type AutoSyncKeyRecord } from "./autoSyncKeyStore";

const RECORD: AutoSyncKeyRecord = {
    grantId: "grant-1",
    key: "c2VjcmV0LWtleS1ieXRlcy1mb3ItdGVzdGluZy0wMDA",
    apiBaseUrl: "https://budget.example.test/api/v1",
};

// Writes a record bypassing the module, to simulate corrupted storage.
async function writeRawRecord(factory: IDBFactory, value: unknown): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open("badger-auto-sync", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("keys");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").put(value, "current");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

describe("autoSyncKeyStore", () => {
    it("round-trips a saved key", async () => {
        const factory = new IDBFactory();
        await saveAutoSyncKey(RECORD, factory);
        expect(await loadAutoSyncKey(factory)).toEqual(RECORD);
    });

    it("replaces the stored key on save", async () => {
        const factory = new IDBFactory();
        await saveAutoSyncKey(RECORD, factory);
        const next = { ...RECORD, grantId: "grant-2", key: "bmV3LWtleQ" };
        await saveAutoSyncKey(next, factory);
        expect(await loadAutoSyncKey(factory)).toEqual(next);
    });

    it("clears the stored key", async () => {
        const factory = new IDBFactory();
        await saveAutoSyncKey(RECORD, factory);
        await clearAutoSyncKey(factory);
        expect(await loadAutoSyncKey(factory)).toBeNull();
    });

    it("returns null when nothing has been stored", async () => {
        expect(await loadAutoSyncKey(new IDBFactory())).toBeNull();
    });

    it("returns null for a malformed record", async () => {
        const factory = new IDBFactory();
        await writeRawRecord(factory, { grantId: "grant-1", key: "", apiBaseUrl: RECORD.apiBaseUrl });
        expect(await loadAutoSyncKey(factory)).toBeNull();
    });

    it("returns null when the stored value is not an object", async () => {
        const factory = new IDBFactory();
        await writeRawRecord(factory, "not-a-record");
        expect(await loadAutoSyncKey(factory)).toBeNull();
    });
});
