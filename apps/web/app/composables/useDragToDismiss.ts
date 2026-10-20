import type { MaybeRefOrGetter, Ref } from "vue";
import { onScopeDispose, readonly, shallowRef, toValue, watch } from "vue";

export interface UseDragToDismissOptions {
    /** Fraction of the element's own height past which releasing dismisses. Default 0.25. */
    dismissFraction?: number;
    /** Downward flick speed (px/ms) that dismisses regardless of distance. Default 0.5. */
    flickVelocity?: number;
    /** Slide-off / snap-back duration in ms. Default 300. */
    duration?: number;
    /** Called once the element has slid off-screen. */
    onDismiss: () => void;
}

export interface UseDragToDismissReturn {
    /** True between pointerdown on the handle and release. */
    isDragging: Readonly<Ref<boolean>>;
    /** Detach every listener this composable owns. */
    stop: () => void;
}

/**
 * Grace period added to `duration` before the fallback timer force-settles a
 * release, so a slightly-late `transitionend` still wins the race.
 */
const SETTLE_SLACK_MS = 50;

/**
 * Drag-a-panel-down-to-dismiss gesture, as used by bottom sheets, modals and
 * notification cards.
 *
 * Dragging `handle` downward translates `target` with the pointer. Releasing
 * either slides `target` fully off-screen and calls `onDismiss`, or snaps it
 * back to its resting position. Works with mouse, touch and pen, because it is
 * built on VueUse's `usePointerSwipe` (PointerEvents) rather than TouchEvents.
 *
 * Deliberately knows nothing about the UI library rendering the panel: the
 * caller supplies `target`, which is resolved lazily on every pointerdown so
 * that panels remounting their root element on each open still work.
 */
export function useDragToDismiss(
    handle: MaybeRefOrGetter<HTMLElement | null | undefined>,
    target: MaybeRefOrGetter<HTMLElement | null | undefined>,
    options: UseDragToDismissOptions,
): UseDragToDismissReturn {
    const { dismissFraction = 0.25, flickVelocity = 0.5, duration = 300, onDismiss } = options;

    const isDragging = shallowRef(false);
    const reducedMotion = usePreferredReducedMotion();

    // Per-drag bookkeeping, captured on pointerdown.
    let targetEl: HTMLElement | null = null;
    let startY = 0;
    let startTime = 0;
    let targetHeight = 0;

    // A release animation is "settling" until either `transitionend` or the
    // fallback timer fires. Tracked so a new drag can't start mid-animation and
    // so pending work can be torn down on scope dispose.
    let settling = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let removeTransitionEnd: (() => void) | null = null;

    function clearPendingSettle() {
        if (settleTimer !== null) {
            clearTimeout(settleTimer);
            settleTimer = null;
        }
        removeTransitionEnd?.();
        removeTransitionEnd = null;
        settling = false;
    }

    function begin(event: PointerEvent) {
        // Ignore a fresh grab while the previous release is still animating.
        if (isDragging.value || settling) return;

        // Resolved per drag, not once at setup: the panel's root element is
        // commonly recreated every time it opens.
        const el = toValue(target) ?? null;
        if (!el) return;

        targetEl = el;
        startY = event.clientY;
        startTime = event.timeStamp;
        targetHeight = el.getBoundingClientRect().height;
        el.style.transition = "none"; // take over from the caller's own transform transition
        isDragging.value = true;
    }

    function track(event: PointerEvent) {
        if (!isDragging.value || !targetEl) return;
        const dy = Math.max(0, event.clientY - startY); // clamp: only downward
        targetEl.style.transform = `translateY(${dy}px)`;
    }

    function release(event: PointerEvent) {
        if (!isDragging.value || !targetEl) return;
        isDragging.value = false;

        const el = targetEl;
        targetEl = null;

        const dy = Math.max(0, event.clientY - startY);
        const dt = event.timeStamp - startTime;
        const velocity = dt > 0 ? dy / dt : 0;

        // A tap (no movement): just release, no animation needed.
        if (dy === 0) {
            el.style.transition = "";
            el.style.transform = "";
            return;
        }

        const shouldDismiss = dy > targetHeight * dismissFraction || velocity > flickVelocity;

        // Idempotent: whichever of `transitionend` / the fallback timer arrives
        // first wins, the other is torn down here.
        let done = false;
        function settle() {
            if (done) return;
            done = true;
            clearPendingSettle();

            if (shouldDismiss) {
                // Deliberately leave the inline transform and transition in
                // place. `onDismiss` typically unmounts the element behind the
                // caller's own leave transition, which renders on this very
                // element. Clearing the inline transform first would leave the
                // leave-from frame with no off-screen override, so the element
                // would snap back to its natural (fully visible) position for a
                // frame and then play a second slide-down. Inline styles beat
                // the leave classes on specificity, so keeping them pins the
                // element off-screen for the whole leave transition. They don't
                // leak: the element is unmounted once the leave finishes.
                onDismiss(); // called AFTER we've slid it off-screen
                return;
            }

            el.style.transition = "";
            el.style.transform = ""; // back to the caller's steady state
        }

        // With reduced motion the browser may zero out transition durations, in
        // which case `transitionend` never fires at all. Skip the animation and
        // settle synchronously rather than relying on an event that won't come.
        if (reducedMotion.value === "reduce") {
            if (shouldDismiss) el.style.transform = "translateY(100%)";
            settle();
            return;
        }

        settling = true;

        function onTransitionEnd(transitionEvent: TransitionEvent) {
            if (transitionEvent.propertyName !== "transform") return;
            settle();
        }
        el.addEventListener("transitionend", onTransitionEnd);
        removeTransitionEnd = () => el.removeEventListener("transitionend", onTransitionEnd);

        // `transitionend` is not guaranteed — a backgrounded tab, the element
        // being hidden mid-transition, or a stylesheet zeroing the duration all
        // swallow it. Without this fallback the element would be stranded
        // translated off-screen but still mounted (invisible, still masking).
        settleTimer = setTimeout(settle, duration + SETTLE_SLACK_MS);

        el.style.transition = `transform ${duration}ms ease`;
        el.style.transform = shouldDismiss ? "translateY(100%)" : "translateY(0)";
    }

    // `usePointerSwipe` force-writes `touch-action: pan-y` on the handle when it
    // mounts, which lets the browser claim vertical gestures for scrolling —
    // the exact axis this drag uses. Re-assert `none` whenever the handle
    // element changes, which also covers handles that mount after this
    // composable is set up (where VueUse's mount-time write never runs).
    watch(
        () => toValue(handle),
        (el) => el?.style.setProperty("touch-action", "none"),
        { immediate: true, flush: "post" },
    );

    // `threshold: 0` makes every pointermove a swipe move, so the element
    // tracks the pointer from the first pixel instead of jumping once the
    // default 50px threshold is crossed.
    const { stop: stopSwipe } = usePointerSwipe(handle, {
        threshold: 0,
        onSwipeStart: begin,
        onSwipe: track,
    });

    // `usePointerSwipe`'s own `onSwipeEnd` only fires when it considers a swipe
    // in progress (so never for a tap that produced no pointermove) and it does
    // not listen for `pointercancel` at all. Own both, so every pointerdown has
    // a matching release and the target can't be left with `transition: none`.
    const stopPointerUp = useEventListener(handle, "pointerup", release);
    const stopPointerCancel = useEventListener(handle, "pointercancel", release);

    onScopeDispose(clearPendingSettle);

    function stop() {
        stopSwipe();
        stopPointerUp();
        stopPointerCancel();
        clearPendingSettle();
    }

    return { isDragging: readonly(isDragging), stop };
}
