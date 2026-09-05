import { describe, expect, it } from "vitest";
import { resolveDentalSubsidy } from "../../src/resolve/subsidy.js";
import type { DentalSubsidyValue, FieldEvidence } from "../../src/model/types.js";

function ev(
  status: DentalSubsidyValue["status"] | null,
  sourceType: FieldEvidence<DentalSubsidyValue>["sourceType"],
  confidence: number,
): FieldEvidence<DentalSubsidyValue> {
  return {
    value: status ? { status } : null,
    sourceUrl: "https://example.se",
    sourceType,
    confidence,
    retrievedAt: "2026-09-04T00:00:00.000Z",
    extractionMethod: "test",
  };
}

describe("resolveDentalSubsidy", () => {
  it("returns unknown, not not_found, when there is no evidence at all", () => {
    const r = resolveDentalSubsidy([]);
    expect(r.value?.status).toBe("unknown");
    expect(r.conflict).toBe(false);
  });

  it("returns confirmed when only confirmed evidence exists", () => {
    const r = resolveDentalSubsidy([ev("confirmed", "clinic_website", 0.6)]);
    expect(r.value?.status).toBe("confirmed");
    expect(r.conflict).toBe(false);
  });

  it("returns not_found when only not_found evidence exists", () => {
    const r = resolveDentalSubsidy([ev("not_found", "clinic_website", 0.6)]);
    expect(r.value?.status).toBe("not_found");
    expect(r.conflict).toBe(false);
  });

  it("returns conflicting, not a coin-flip pick, when sources genuinely disagree", () => {
    const r = resolveDentalSubsidy([ev("confirmed", "clinic_website", 0.6), ev("not_found", "national_health_portal", 0.8)]);
    expect(r.value?.status).toBe("conflicting");
    expect(r.conflict).toBe(true);
    expect(r.resolutionNote).toContain("1 source(s) confirmed");
  });

  it("does not treat two confirmed sources as a conflict", () => {
    const r = resolveDentalSubsidy([ev("confirmed", "clinic_website", 0.6), ev("confirmed", "national_health_portal", 0.8)]);
    expect(r.conflict).toBe(false);
    expect(r.value?.status).toBe("confirmed");
  });
});