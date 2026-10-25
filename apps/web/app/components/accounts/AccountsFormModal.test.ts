// Source-text contract for the account form's icon wiring. The web test runner is Vitest in a node environment
// with no DOM, so the form is checked against its source, not mounted.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("account form icon", () => {
    const form = source("./AccountsFormModal.vue");

    it("renders the shared icon picker with a Default for type tile that follows the account type", () => {
        expect(form).toMatch(/<SharedIconPicker[\s\S]*?v-model="accountIcon"[\s\S]*?:color="accountColor"/);
        expect(form).toContain(':fallback="accountFallbackIcon(accountType)"');
        expect(form).toContain(':default-tile="defaultIconTile"');
        expect(form).toMatch(
            /defaultIconTile = computed\(\(\) => \(\{\s*icon: accountFallbackIcon\(accountType\.value\),/,
        );
    });

    it("no longer has the free-text icon input", () => {
        expect(form).not.toContain('id="account-icon"');
        expect(form).not.toContain("e.g. wallet");
    });

    it("starts as Default (null) and marks the icon touched only when the user picks", () => {
        expect(form).toContain("const accountIcon = ref<AvatarIconName | null>(null);");
        expect(form).toContain('@update:model-value="iconTouched = true"');
    });

    it("loads a stored icon in edit mode, showing legacy names as the default", () => {
        expect(form).toContain("accountIcon.value = isAvatarIconName(props.account.icon) ? props.account.icon : null;");
    });

    it("sends the icon on create only when it is not Default", () => {
        expect(form).toContain("...(accountIcon.value ? { icon: accountIcon.value } : {}),");
    });

    it("sends the icon on update only through iconPatch, never echoing a stored legacy icon", () => {
        expect(form).toContain("...iconPatch(props.account.icon, accountIcon.value, iconTouched.value)");
    });
});
