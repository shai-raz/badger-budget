import { describe, expect, it } from "vitest";
import { createConsentGate } from "./consentGate";

describe("createConsentGate", () => {
    it("is not ready before activation", () => {
        const gate = createConsentGate(1000);
        gate.interact(true);
        expect(gate.isReady(5000)).toBe(false);
    });

    it("needs both the delay and a trusted interaction", () => {
        const gate = createConsentGate(1000);
        gate.setActive(true, 0);
        expect(gate.isReady(2000)).toBe(false);
        gate.interact(true);
        expect(gate.isReady(999)).toBe(false);
        expect(gate.isReady(1000)).toBe(true);
    });

    it("ignores synthetic events", () => {
        const gate = createConsentGate(1000);
        gate.setActive(true, 0);
        gate.interact(false);
        expect(gate.isReady(5000)).toBe(false);
    });

    it("resets when the page loses visibility or focus", () => {
        const gate = createConsentGate(1000);
        gate.setActive(true, 0);
        gate.interact(true);
        gate.setActive(false, 500);
        gate.setActive(true, 600);
        expect(gate.isReady(2000)).toBe(false);
        gate.interact(true);
        expect(gate.isReady(1599)).toBe(false);
        expect(gate.isReady(1600)).toBe(true);
    });

    it("repeated activation reports do not restart the timer", () => {
        const gate = createConsentGate(1000);
        gate.setActive(true, 0);
        gate.setActive(true, 800);
        gate.interact(true);
        expect(gate.isReady(1000)).toBe(true);
    });
});
