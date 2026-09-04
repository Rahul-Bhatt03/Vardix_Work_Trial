import { describe, expect, it } from "vitest";
import { detectDentalSubsidyMentions } from "../../src/extract/subsidy.js";

describe("detectDentalSubsidyMentions", () => {
  it("finds an explicit mention of the state subsidy scheme", () => {
    const m = detectDentalSubsidyMentions("Vi är anslutna till det statliga tandvårdsstödet.");
    expect(m.some((x) => x.status === "confirmed")).toBe(true);
  });

  it("finds the ATB abbreviation", () => {
    const m = detectDentalSubsidyMentions("Du kan använda ditt ATB hos oss varje år.");
    expect(m.some((x) => x.status === "confirmed")).toBe(true);
  });

  it("does NOT infer subsidy connection from a plain mention of dental care", () => {
    // This is the exact trap the brief calls out: offering tandvård is not
    // evidence of subsidy participation.
    const m = detectDentalSubsidyMentions("Vi erbjuder allmän tandvård och estetisk tandvård för hela familjen.");
    expect(m.length).toBe(0);
  });

  it("finds an explicit negative statement", () => {
    const m = detectDentalSubsidyMentions("Vi tar ej emot tandvårdsbidrag, endast privatbetalande patienter.");
    expect(m.some((x) => x.status === "not_found")).toBe(true);
  });
});