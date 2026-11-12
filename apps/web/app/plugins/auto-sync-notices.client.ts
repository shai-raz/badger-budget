import { watchAutoSyncNotices } from "../utils/push/autoSyncNotices";

// Closes the auto-sync notice when Badger opens or returns to the foreground. Not gated on sign-in: closing is a no-op
// when nothing is shown.
export default defineNuxtPlugin(() => {
    watchAutoSyncNotices(document, () =>
        "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined),
    );
});
