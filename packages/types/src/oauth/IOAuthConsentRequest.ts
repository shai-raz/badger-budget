export interface IOAuthConsentRequest {
    clientName: string;
    redirectDisplay: string;
    verified: boolean;
    loopback: boolean;
    scopes: string[];
    expiresAt: string;
}
