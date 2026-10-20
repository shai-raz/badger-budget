/** Google sign-in is only available when both OAuth client credentials are set (non-empty after trimming). */
export function isGoogleAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID?.trim()) && Boolean(env.GOOGLE_CLIENT_SECRET?.trim());
}
