import { describe, expect, it } from "vitest";
import { buildQualityReport, buildRunReport } from "../../src/output/writer.js";
import type { ResolvedClinic } from "../../src/model/types.js";

function emptyFields() {
  const empty = { value: null, confidence: 0, conflict: false, evidence: [] };
  return {
    canonicalName: { ...empty },
    orgNumber: { ...empty },
    visitingAddress: { ...empty },
    phone: { ...empty },
    email: { ...empty },
    openingHours: { ...empty },
    services: { ...empty },
    dentalSubsidy: { value: { status: "unknown" as const }, confidence: 0, conflict: false, evidence: [] },
    bookingUrl: { ...empty },
  };
}

function makeClinic(overrides: Partial<ResolvedClinic["fields"]> = {}, skipped = 0, errors: string[] = []): ResolvedClinic {
  return {
    seed: { id: "c1", name: "Clinic", orgNoSeed: null, website: "https://c.se", city: "Stockholm", county: null, segment: "tandvard" },
    fields: { ...emptyFields(), ...overrides },
    sourcesChecked: ["https://c.se"],
    sourcesSkipped: Array.from({ length: skipped }, () => ({
      clinicId: "c1",
      url: "https://x.se",
      sourceType: "clinic_website" as const,
      reason: "not_found" as const,
      attemptedAt: "2026-09-04T00:00:00.000Z",
    })),
    processingErrors: errors,
  };
}

describe("buildQualityReport", () => {
  it("counts resolved vs null per field", () => {
    const clinics = [
      makeClinic({ phone: { value: "+46812345678", confidence: 0.8, conflict: false, evidence: [] } }),
      makeClinic(),
    ];
    const report = buildQualityReport(clinics);
    const phoneField = report.perField.find((f) => f.field === "phone")!;
    expect(phoneField.resolvedCount).toBe(1);
    expect(phoneField.nullCount).toBe(1);
  });

  it("treats dentalSubsidy status 'unknown' as null for reporting purposes", () => {
    const clinics = [makeClinic()];
    const report = buildQualityReport(clinics);
    const subsidyField = report.perField.find((f) => f.field === "dentalSubsidy")!;
    expect(subsidyField.nullCount).toBe(1);
    expect(subsidyField.resolvedCount).toBe(0);
  });

  it("counts conflicts per field and clinics-with-any-conflict across fields", () => {
    const clinics = [
      makeClinic({ phone: { value: "x", confidence: 0.5, conflict: true, evidence: [] } }),
      makeClinic({ email: { value: "y", confidence: 0.5, conflict: true, evidence: [] } }),
      makeClinic(),
    ];
    const report = buildQualityReport(clinics);
    expect(report.totalConflicts).toBe(2);
    expect(report.clinicsWithAnyConflict).toBe(2);
  });
});

describe("buildRunReport", () => {
  it("tallies sources checked and skipped, grouped by reason", () => {
    const clinics = [makeClinic({}, 2), makeClinic({}, 1)];
    const report = buildRunReport(clinics);
    expect(report.totalSourcesSkipped).toBe(3);
    expect(report.skippedByReason.not_found).toBe(3);
  });

  it("counts clinics with processing errors", () => {
    const clinics = [makeClinic({}, 0, ["boom"]), makeClinic()];
    const report = buildRunReport(clinics);
    expect(report.clinicsWithProcessingErrors).toBe(1);
  });
});