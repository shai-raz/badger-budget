import type { MaybeRefOrGetter, Ref } from "vue";
import { computed, toValue } from "vue";

interface CategoryOptionLike {
    value: string;
}

/**
 * Shared category selection logic for the transactions filter controls.
 * Both the desktop inline panel (pill chips) and the mobile bottom sheet
 * (vertical list) drive the same `selectedCategoryIds` model through this,
 * so the two presentations never duplicate the toggle math.
 *
 * Convention: an empty `selectedCategoryIds` array means "all categories"
 * (no filter param sent) and is presented as a dedicated "All categories"
 * control rather than as every option reading selected. Selection is additive
 * from there, so the first tap on a category isolates it in one move and a
 * zero-result "nothing selected" state is unreachable — removing the last
 * selection lands back on "all". Selecting every option collapses back to the
 * empty array so "all" has exactly one representation.
 *
 * `invert` covers the opposite intent: "everything except these" costs a short
 * selection plus one flip instead of N-1 taps. Because a full selection always
 * collapses to `[]`, the selection is a proper non-empty subset whenever
 * `isAllActive` is false — so the complement is never empty, and inverting
 * twice returns exactly where it started.
 *
 * Selections are always stored in `categoryOptions` order rather than tap
 * order, so the same logical set always serialises to the same `categoryIds`
 * param and a double invert re-uses the cached query instead of refetching.
 */
export function useCategoryToggle(
    selectedCategoryIds: Ref<string[]>,
    categoryOptions: MaybeRefOrGetter<CategoryOptionLike[]>,
) {
    const allValues = computed(() => toValue(categoryOptions).map((option) => option.value));

    /** True when no explicit selection is active, i.e. the list spans every category. */
    const isAllActive = computed(() => selectedCategoryIds.value.length === 0);

    /** The selection intersected with the live options, in `categoryOptions` order. */
    const selectedValues = computed(() => allValues.value.filter((value) => selectedCategoryIds.value.includes(value)));

    /** "All categories" / "3 of 11 selected" — shown next to the Categories heading. */
    const countLabel = computed(() =>
        isAllActive.value ? "All categories" : `${selectedValues.value.length} of ${allValues.value.length} selected`,
    );

    function isSelected(value: string): boolean {
        return selectedCategoryIds.value.includes(value);
    }

    /**
     * The only writer. Prunes `next` down to the live options first, then
     * collapses a full selection back to the "no filter" empty array, so "all"
     * keeps exactly one representation no matter which control produced the
     * change. The prune has to come first: an id that is no longer an option
     * would otherwise pad `next.length` and collapse a partial selection — and
     * the same stale id would inflate `countLabel`'s numerator.
     */
    function setSelection(next: string[]): void {
        const pruned = allValues.value.filter((value) => next.includes(value));

        selectedCategoryIds.value = pruned.length === allValues.value.length ? [] : pruned;
    }

    function toggle(value: string): void {
        setSelection(
            isSelected(value)
                ? selectedCategoryIds.value.filter((id) => id !== value)
                : [...selectedCategoryIds.value, value],
        );
    }

    function selectAll(): void {
        selectedCategoryIds.value = [];
    }

    /**
     * True while inverting would mean something: at least one category is
     * selected, and there is more than one option to flip between. The second
     * half also covers the window before the categories query resolves, when
     * `categoryOptions` holds only the "Uncategorized" pseudo-entry — inverting
     * there would commit a wrong single-id filter.
     */
    const canInvert = computed(() => !isAllActive.value && allValues.value.length > 1);

    /**
     * Swap the selection for its complement. Derived from `allValues`, so ids
     * for categories that no longer exist drop out on their own. The result
     * cannot be empty while `toggle` upholds the collapse rule; if that were
     * ever broken upstream, `setSelection` lands on "all" rather than on the
     * zero-result state the All chip exists to prevent.
     */
    function invert(): void {
        if (!canInvert.value) return;

        setSelection(allValues.value.filter((value) => !isSelected(value)));
    }

    return { allValues, isAllActive, canInvert, countLabel, isSelected, toggle, selectAll, invert };
}
