import type { Prisma, UserRole } from "@prisma/client";
import { parseColorTheme, type ColorThemeName } from "@badger/shared-data";
import { DEMO_EMAIL } from "../demo/demo-data.constants";

/** Columns read for the signed-in user. Every auth path (JWT validation, token issuing) selects through this. */
export const AUTH_USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    colorTheme: true,
} satisfies Prisma.UserSelect;

/** The signed-in user as the API returns it (auth responses and `request.user`). */
export interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    colorTheme: ColorThemeName | null;
    isDemo: boolean;
}

export function toAuthUser(row: Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>): AuthUser {
    return {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        role: row.role,
        colorTheme: parseColorTheme(row.colorTheme),
        isDemo: row.email === DEMO_EMAIL,
    };
}
