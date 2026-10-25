// Source-text contract for the category form's icon wiring. The web test runner is Vitest in a node environment
// with no DOM, so the form is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("category form icon", () => {
    const form = source("./FormModal.vue");

    it("renders the shared icon picker beside the name, with the colour as its tint", () => {
        expect(form).toMatch(/<SharedIconPicker[\s\S]*?v-model="categoryIcon"[\s\S]*?:color="categoryColor"/);
        expect(form).toContain('fallback="tag"');
    });

    it("marks the icon touched only when the user picks one", () => {
        expect(form).toContain('@update:model-value="iconTouched = true"');
    });

    it("follows the name in add mode until the icon is touched", () => {
        expect(form).toMatch(
            /watch\(categoryName, \(name\) => \{\s*if \(!isEditMode\.value && !iconTouched\.value\) \{\s*categoryIcon\.value = defaultCategoryIcon\(name\);/,
        );
    });

    it("loads a stored icon in edit mode, falling back for legacy names", () => {
        expect(form).toContain(
            "isAvatarIconName(props.category.icon) ? props.category.icon : DEFAULT_CATEGORY_AVATAR_ICON",
        );
    });

    it("keeps the mutation path for non-deferred saves", () => {
        expect(form).toMatch(/if \(props\.deferred\) \{\s*handleDone\(\);\s*return;\s*\}/);
        expect(form).toContain("const { data: categories } = useGetCategoriesQuery();");
    });

    it("sends the icon on create", () => {
        expect(form).toMatch(/createMutation\.mutateAsync\(\{[\s\S]*?icon: categoryIcon\.value,[\s\S]*?\}\)/);
    });

    it("sends the icon on update only through iconPatch, never echoing a stored legacy icon", () => {
        expect(form).toContain("...iconPatch(props.category.icon, categoryIcon.value, iconTouched.value)");
    });

    it("resets the touched flag and icon on every load", () => {
        expect(form).toMatch(/const loadCategory = \(\) => \{\s*iconTouched\.value = false;/);
    });

    it("remounts the colour picker on each open", () => {
        expect(form).toContain(':key="colorPickerKey"');
        expect(form).toContain("colorPickerKey.value++");
    });

    it("labels the name and colour fields in sentence case", () => {
        expect(form).toContain(">Category name *<");
        expect(form).toContain(">Category color *<");
    });
});

describe("category form deferred mode", () => {
    const form = source("./FormModal.vue");

    it("isolates Escape so a stacked parent dialog stays open", () => {
        expect(form).toContain("isolate-escape");
    });

    it("titles the dialog New category and labels its save action Done", () => {
        expect(form).toMatch(/if \(props\.deferred\) return "New category";/);
        expect(form).toContain(`:save-label="deferred ? 'Done' : 'Save'"`);
    });

    it("is never in edit mode while deferred", () => {
        expect(form).toContain("const isEditMode = computed(() => !props.deferred && !!props.category);");
    });

    it("loads the pending values on open and keeps the icon following the name until customised", () => {
        expect(form).toMatch(
            /if \(props\.deferred\) \{\s*if \(props\.pending\) \{[\s\S]*?categoryIcon\.value = props\.pending\.icon;[\s\S]*?iconTouched\.value = props\.pending\.icon !== defaultCategoryIcon\(props\.pending\.name\);/,
        );
    });

    it("rejects a name that matches an existing category, case-insensitively, with an inline error", () => {
        expect(form).toMatch(/createOptionName\(categoryName\.value, existing\) === null/);
        expect(form).toContain('v-if="duplicateName"');
        expect(form).toContain("A category with this name already exists");
        expect(form).toContain(':invalid="duplicateName"');
        expect(form).toMatch(/!duplicateName\.value/);
    });

    it("emits the trimmed values on Done, without saving, and closes", () => {
        expect(form).toMatch(
            /const handleDone = \(\) => \{\s*if \(!canSave\.value\) return;\s*emit\("done", \{\s*name: categoryName\.value\.trim\(\),\s*color: categoryColor\.value\.trim\(\),/,
        );
        expect(form).toMatch(/if \(props\.deferred\) \{\s*handleDone\(\);\s*return;\s*\}/);
    });
});
