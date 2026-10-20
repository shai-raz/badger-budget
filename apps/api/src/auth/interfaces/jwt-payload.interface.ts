export interface JwtPayload {
    sub: string; // user id
    email: string;
    iat?: number;
    exp?: number;
}
