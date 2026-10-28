import { DEMO_EMAIL as SHARED_DEMO_EMAIL } from "@badger/shared-data";
import { DEMO_EMAIL } from "./demo-data.constants";

describe("demo data constants", () => {
    it("keeps DEMO_EMAIL equal to the shared-data value", () => {
        expect(DEMO_EMAIL).toBe(SHARED_DEMO_EMAIL);
    });
});
