import type { AuthUser } from "../auth-user";

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
}
