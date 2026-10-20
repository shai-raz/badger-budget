export interface IRegisterSyncPasskey {
    pin: string;
    credentialId: string;
    prfSalt: string;
    wrappedPinCt: string;
    wrappedPinIv: string;
    label: string;
}
