/** Application role of a user. ADMIN is granted by the backfill and the create rule (see api auth). */
export type UserRole = "USER" | "ADMIN";

/** The signed-in user as returned by the auth endpoints. */
export interface IAuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
}

/** Login, register and refresh responses. */
export interface IAuthResponse {
    accessToken: string;
    refreshToken: string;
    user: IAuthUser;
}
