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
