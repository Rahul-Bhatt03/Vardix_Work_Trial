import { describe, expect, it } from "vitest";
import { resolveField } from "../../src/resolve/resolver.js";
import { exactEquals, stringEquals } from "../../src/resolve/equality.js";
import type { FieldEvidence } from "../../src/model/types.js";

function ev(value: string | null, sourceType: FieldEvidence<string>["sourceType"], confidence: number): FieldEvidence<string> {
  return { value, sourceUrl: "https://example.se", sourceType, confidence, retrievedAt: "2026-09-04T00:00:00.000Z", extractionMethod: "test" };
}

describe("resolveField", () => {
  it("returns null/unresolved when there is no evidence", () => {
    const r = resolveField<string>([], { equals: exactEquals });
    expect(r.value).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.conflict).toBe(false);
  });

  it("ignores null-value evidence when picking the value", () => {
    const r = resolveField([ev(null, "clinic_website", 0.5), ev("+46812345678", "national_health_portal", 0.8)], {
      equals: exactEquals,
    });
    expect(r.value).toBe("+46812345678");
    expect(r.conflict).toBe(false);
  });

  it("boosts confidence when two independent source types agree", () => {
    const single = resolveField([ev("+46812345678", "clinic_website", 0.7)], { equals: exactEquals });
    const agreeing = resolveField(
      [ev("+46812345678", "clinic_website", 0.7), ev("+46812345678", "national_health_portal", 0.85)],
      { equals: exactEquals },
    );
    expect(agreeing.confidence).toBeGreaterThan(single.confidence);
    expect(agreeing.conflict).toBe(false);
  });

  it("does NOT boost confidence when two pieces of evidence from the SAME source type agree", () => {
    // e.g. the phone number appears twice on one page — that is not two
    // independent confirmations.
    const r = resolveField([ev("+46812345678", "clinic_website", 0.7), ev("+46812345678", "clinic_website", 0.6)], {
      equals: exactEquals,
    });
    expect(r.confidence).toBe(0.7); // max of the two, no bonus
  });

  it("flags a genuine disagreement as a conflict and explains the resolution", () => {
    const r = resolveField(
      [ev("+46812345678", "clinic_website", 0.6), ev("+46899999999", "national_health_portal", 0.85)],
      { equals: exactEquals },
    );
    expect(r.conflict).toBe(true);
    expect(r.value).toBe("+46899999999"); // higher confidence wins
    expect(r.resolutionNote).toBeDefined();
    expect(r.resolutionNote).toContain("+46812345678");
    expect(r.resolutionNote).toContain("national_health_portal");
  });

  it("never drops the losing evidence from the evidence array, even when it loses the conflict", () => {
    const r = resolveField(
      [ev("+46812345678", "clinic_website", 0.6), ev("+46899999999", "national_health_portal", 0.85)],
      { equals: exactEquals },
    );
    expect(r.evidence.length).toBe(2);
    expect(r.evidence.map((e) => e.value)).toEqual(expect.arrayContaining(["+46812345678", "+46899999999"]));
  });

  it("treats values as equal under a case-insensitive comparator without flagging a conflict", () => {
    const r = resolveField([ev("Alfa Tandvård", "clinic_website", 0.5), ev("alfa tandvård", "national_health_portal", 0.8)], {
      equals: stringEquals,
    });
    expect(r.conflict).toBe(false);
  });

  it("caps confidence at 0.99 even with many agreeing sources", () => {
    const many = [
      ev("x", "clinic_website", 0.9),
      ev("x", "national_health_portal", 0.9),
      ev("x", "registry", 0.9),
      ev("x", "map_listing", 0.9),
    ];
    const r = resolveField(many, { equals: exactEquals });
    expect(r.confidence).toBeLessThanOrEqual(0.99);
  });
});