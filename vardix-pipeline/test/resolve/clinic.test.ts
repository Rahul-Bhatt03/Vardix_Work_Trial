import { describe, expect, it } from "vitest";
import { resolveClinicFields } from "../../src/resolve/clinic.js";
import type { RawEvidence } from "../../src/sources/types.js";

const now = "2026-09-04T00:00:00.000Z";

describe("resolveClinicFields", () => {
  it("merges agreeing evidence from two sources and boosts confidence", () => {
    const websiteEvidence: RawEvidence = {
      phone: [
        {
          value: "+46451123456",
          sourceUrl: "https://alfatandvard.se",
          sourceType: "clinic_website",
          confidence: 0.75,
          retrievedAt: now,
          extractionMethod: "tel-link",
        },
      ],
    };
    const registryEvidence: RawEvidence = {
      phone: [
        {
          value: "+46451123456",
          sourceUrl: "https://www.1177.se/hitta-vard/kontaktkort/alfa/",
          sourceType: "national_health_portal",
          confidence: 0.9,
          retrievedAt: now,
          extractionMethod: "tel-link",
        },
      ],
    };
    const resolved = resolveClinicFields([websiteEvidence, registryEvidence]);
    expect(resolved.phone.value).toBe("+46451123456");
    expect(resolved.phone.conflict).toBe(false);
    expect(resolved.phone.confidence).toBeGreaterThan(0.9);
  });

  it("flags a real cross-source phone number conflict and keeps both in evidence", () => {
    const websiteEvidence: RawEvidence = {
      phone: [
        { value: "+46451111111", sourceUrl: "https://a.se", sourceType: "clinic_website", confidence: 0.6, retrievedAt: now, extractionMethod: "regex:phone" },
      ],
    };
    const registryEvidence: RawEvidence = {
      phone: [
        { value: "+46451222222", sourceUrl: "https://1177.se/x", sourceType: "national_health_portal", confidence: 0.85, retrievedAt: now, extractionMethod: "tel-link" },
      ],
    };
    const resolved = resolveClinicFields([websiteEvidence, registryEvidence]);
    expect(resolved.phone.conflict).toBe(true);
    expect(resolved.phone.evidence.length).toBe(2);
  });

  it("leaves a field unresolved (null, confidence 0) when no source produced evidence for it", () => {
    const resolved = resolveClinicFields([{}]);
    expect(resolved.email.value).toBeNull();
    expect(resolved.email.confidence).toBe(0);
    expect(resolved.bookingUrl.value).toBeNull();
  });

  it("resolves dental subsidy through the special-case path, not the generic exact-equals path", () => {
    const a: RawEvidence = { dentalSubsidy: [{ value: { status: "confirmed" }, sourceUrl: "https://a.se", sourceType: "clinic_website", confidence: 0.6, retrievedAt: now, extractionMethod: "regex" }] };
    const resolved = resolveClinicFields([a]);
    expect(resolved.dentalSubsidy.value?.status).toBe("confirmed");
  });

  it("merges services as a set, treating differently-ordered equal lists as agreement not conflict", () => {
    const a: RawEvidence = { services: [{ value: ["Implantat", "Rotfyllning"], sourceUrl: "https://a.se", sourceType: "clinic_website", confidence: 0.6, retrievedAt: now, extractionMethod: "vocab" }] };
    const b: RawEvidence = { services: [{ value: ["Rotfyllning", "Implantat"], sourceUrl: "https://1177.se/x", sourceType: "national_health_portal", confidence: 0.7, retrievedAt: now, extractionMethod: "vocab" }] };
    const resolved = resolveClinicFields([a, b]);
    expect(resolved.services.conflict).toBe(false);
  });
});