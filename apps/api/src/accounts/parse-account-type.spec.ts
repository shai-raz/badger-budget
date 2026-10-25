import { ACCOUNT_TYPES, parseAccountType } from "@badger/shared-data";

describe("parseAccountType", () => {
    it.each(ACCOUNT_TYPES.map((type) => [type]))("returns %s unchanged", (type) => {
        expect(parseAccountType(type)).toBe(type);
    });

    it.each([["Bank"], ["CASH"], [" savings"], ["checking"], [""]])(
        "maps the unrecognized value %j to unknown",
        (raw) => {
            expect(parseAccountType(raw)).toBe("unknown");
        },
    );
});
