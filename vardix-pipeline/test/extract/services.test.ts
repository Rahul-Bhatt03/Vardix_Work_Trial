import { describe, expect, it } from "vitest";
import { matchServices } from "../../src/extract/services.js";

describe("matchServices", () => {
  it("matches clinical vocabulary in a dental services paragraph", () => {
    const text = "Vi utför implantat, rotfyllning och tandreglering för både barn och vuxna.";
    const found = matchServices(text, "tandvard").map((s) => s.canonical);
    expect(found).toContain("Implantat");
    expect(found).toContain("Rotfyllning");
    expect(found).toContain("Tandreglering");
  });

  it("does not match marketing fluff with no clinical term", () => {
    const text = "Vi är Sveriges vänligaste team och älskar att le mot våra patienter!";
    const found = matchServices(text, "tandvard");
    expect(found.length).toBe(0);
  });

  it("matches skin-clinic vocabulary for the hud segment", () => {
    const text = "Vi erbjuder hudcancerkontroll och behandling av akne och eksem.";
    const found = matchServices(text, "hud").map((s) => s.canonical);
    expect(found).toContain("Hudcancerkontroll");
    expect(found).toContain("Akne-behandling");
    expect(found).toContain("Eksem/psoriasis");
  });

  it("does not cross-match a hud-only term for a tandvard segment", () => {
    const text = "Vi behandlar akne och eksem varje dag.";
    const found = matchServices(text, "tandvard");
    expect(found.length).toBe(0);
  });

  it("keeps an evidence snippet around the match", () => {
    const text = "Efter en noggrann undersökning erbjuder vi rotfyllning vid behov.";
    const found = matchServices(text, "tandvard");
    const rf = found.find((s) => s.canonical === "Rotfyllning");
    expect(rf?.evidenceText).toContain("rotfyllning");
  });
});