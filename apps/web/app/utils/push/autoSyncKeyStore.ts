// Holds the device-side auto-sync key in IndexedDB so the service worker can read it without the page open.
// Raw IndexedDB, no dependency: this module is also reachable from the service-worker bundle.

const DB_NAME = "badger-auto-sync";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const RECORD_KEY = "current";

export interface AutoSyncKeyRecord {
    grantId: string;
    /** base64url, 32 bytes */
    key: string;
    apiBaseUrl: string;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Resolves with the request result only once the transaction commits, so a write is durable when the promise settles.
async function withStore<T>(
    factory: IDBFactory,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDatabase(factory);
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            let result: T | undefined;
            const request = run(tx.objectStore(STORE_NAME));
            request.onsuccess = () => {
                result = request.result;
            };
            tx.oncomplete = () => resolve(result as T);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function isAutoSyncKeyRecord(value: unknown): value is AutoSyncKeyRecord {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return isNonEmptyString(record.grantId) && isNonEmptyString(record.key) && isNonEmptyString(record.apiBaseUrl);
}

export async function saveAutoSyncKey(record: AutoSyncKeyRecord, factory: IDBFactory = indexedDB): Promise<void> {
    const stored: AutoSyncKeyRecord = { grantId: record.grantId, key: record.key, apiBaseUrl: record.apiBaseUrl };
    await withStore(factory, "readwrite", (store) => store.put(stored, RECORD_KEY));
}

// Never throws: a missing database, a missing record or a malformed record all read as "no key".
export async function loadAutoSyncKey(factory: IDBFactory = indexedDB): Promise<AutoSyncKeyRecord | null> {
    try {
        const value: unknown = await withStore(factory, "readonly", (store) => store.get(RECORD_KEY));
        return isAutoSyncKeyRecord(value) ? value : null;
    } catch {
        return null;
    }
}

export async function clearAutoSyncKey(factory: IDBFactory = indexedDB): Promise<void> {
    await withStore(factory, "readwrite", (store) => store.delete(RECORD_KEY));
}
