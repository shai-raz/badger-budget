export interface IOAuthConnection {
    id: string;
    clientName: string;
    createdAt: string;
    lastUsedAt: string | null;
    scopes: string[];
}
