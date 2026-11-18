/** Avatar initials: first letters of the names, else the email's first letter, else "?". */
export function initialsOf(user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}): string {
    const letters = `${user.firstName?.trim().charAt(0) ?? ""}${user.lastName?.trim().charAt(0) ?? ""}`.toUpperCase();
    if (letters) return letters;
    return user.email?.trim().charAt(0).toUpperCase() || "?";
}
