import type { MaybeRefOrGetter, Ref } from "vue";
import { computed, nextTick, toValue } from "vue";

interface FilterOptionLike<T extends string> {
    value: T;
}

/**
 * Shared multi-select logic for the transactions filter controls. Both the desktop inline panel (pill chips) and the
 * mobile bottom sheet (vertical list) drive the same `selected` model through this, so the two presentations never
 * duplicate the toggle math.
 *
 * Convention: an empty `selected` array means "all" (no filter param sent) and is presented as a dedicated "All"
 * control rather than as every option reading selected. Selection is additive from there, so the first tap on an
 * option isolates it in one move and a zero-result "nothing selected" state is unreachable — removing the last
 * selection lands back on "all". Selecting every option collapses back to the empty array so "all" has exactly one
 * representation.
 *
 * `invert` covers the opposite intent: "everything except these" costs a short selection plus one flip instead of N-1
 * taps. Because a full selection always collapses to `[]`, the selection is a proper non-empty subset whenever
 * `isAllActive` is false — so the complement is never empty, and inverting twice returns exactly where it started.
 *
 * Selections are always stored in `options` order rather than tap order, so the same logical set always serialises to
 * the same param and a double invert re-uses the cached query instead of refetching.
 */
export function useFilterToggle<T extends string>(
    selected: Ref<T[]>,
    options: MaybeRefOrGetter<readonly FilterOptionLike<T>[]>,
) {
    const allValues = computed(() => toValue(options).map((option) => option.value));

    /**
     * The last selection this composable wrote. The parent's model only catches up on its next render, so within the
     * same task a second toggle would read a stale selection and drop the first one. The shadow is the base for those
     * toggles until the next tick, by which point the render has run and the model is current.
     */
    let shadow: T[] | null = null;

    /** The selection the next change builds on. */
    const currentSelection = (): T[] => shadow ?? selected.value;

    /** True when no explicit selection is active, i.e. the list spans every option. */
    const isAllActive = computed(() => selected.value.length === 0);

    /** The selection intersected with the live options, in `options` order. */
    const selectedValues = computed(() => allValues.value.filter((value) => selected.value.includes(value)));

    function isSelected(value: T): boolean {
        return currentSelection().includes(value);
    }

    /** Writes `next` as the selection and shadows it until the next tick. */
    function write(next: T[]): void {
        shadow = next;
        selected.value = next;
        void nextTick(() => {
            shadow = null;
        });
    }

    /**
     * The only writer. Prunes `next` down to the live options first, then collapses a full selection back to the "no
     * filter" empty array, so "all" keeps exactly one representation no matter which control produced the change. The
     * prune has to come first: an id that is no longer an option would otherwise pad `next.length` and collapse a
     * partial selection.
     */
    function setSelection(next: T[]): void {
        const pruned = allValues.value.filter((value) => next.includes(value));

        write(pruned.length === allValues.value.length ? [] : pruned);
    }

    function toggle(value: T): void {
        setSelection(
            isSelected(value) ? currentSelection().filter((id) => id !== value) : [...currentSelection(), value],
        );
    }

    function selectAll(): void {
        write([]);
    }

    /**
     * True while inverting would mean something: at least one option is selected, and there is more than one option to
     * flip between. The second half also covers the window before the source list resolves, when `options` holds only a
     * placeholder entry — inverting there would commit a wrong single-id filter.
     */
    const canInvert = computed(() => !isAllActive.value && allValues.value.length > 1);

    /**
     * Swap the selection for its complement. Derived from `allValues`, so ids that no longer exist drop out on their
     * own. The result cannot be empty while `toggle` upholds the collapse rule; if that were ever broken upstream,
     * `setSelection` lands on "all" rather than on the zero-result state the All control exists to prevent.
     */
    function invert(): void {
        if (!canInvert.value) return;

        setSelection(allValues.value.filter((value) => !isSelected(value)));
    }

    return { allValues, isAllActive, canInvert, selectedValues, isSelected, toggle, selectAll, invert };
}
