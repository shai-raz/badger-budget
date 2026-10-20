export interface ISyncPasskey {
    id: string;
    credentialId: string;
    prfSalt: string;
    wrappedPinCt: string;
    wrappedPinIv: string;
    label: string;
    createdAt: string;
}
