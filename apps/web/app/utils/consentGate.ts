/**
 * Guards the consent page's Allow button against DoubleClickjacking: Allow stays
 * disabled until the page has been visible and focused for `delayMs` AND a real
 * (trusted) pointer or keyboard event happened while it was. Pure state machine
 * with injected time so it can be tested without a DOM.
 */
export const CONSENT_ARM_DELAY_MS = 1000;

export interface ConsentGate {
    /** Report whether the page is currently visible and focused. */
    setActive(active: boolean, now: number): void;
    /** Report a pointer/key event; ignored when synthetic or while inactive. */
    interact(isTrusted: boolean): void;
    isReady(now: number): boolean;
}

export const createConsentGate = (delayMs: number = CONSENT_ARM_DELAY_MS): ConsentGate => {
    let activeSince: number | null = null;
    let interacted = false;
    return {
        setActive(active, now) {
            if (!active) {
                activeSince = null;
                interacted = false;
            } else if (activeSince === null) {
                activeSince = now;
            }
        },
        interact(isTrusted) {
            if (isTrusted && activeSince !== null) interacted = true;
        },
        isReady(now) {
            return activeSince !== null && interacted && now - activeSince >= delayMs;
        },
    };
};
