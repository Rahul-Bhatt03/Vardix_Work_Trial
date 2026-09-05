import { describe, expect, it } from "vitest";
import { runGoldSetEvaluation } from "../../src/eval/metrics.js";
import type { GoldClinic } from "../../src/eval/goldset.js";
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
    services: { ...empty, value: [] as string[] },
    dentalSubsidy: { value: { status: "unknown" as const }, confidence: 0, conflict: false, evidence: [] },
    bookingUrl: { ...empty },
  };
}

function goldRow(overrides: Partial<GoldClinic> = {}): GoldClinic {
  return {
    clinicId: "c1",
    clinicName: "Clinic 1",
    canonicalName: null,
    orgNumber: null,
    visitingAddress: null,
    phone: null,
    email: null,
    openingHours: null,
    services: null,
    dentalSubsidy: null,
    bookingUrl: null,
    labelledFrom: "manual check",
    labelledAt: "2026-09-04",
    ...overrides,
  };
}

function resolvedRow(id: string, overrides: Partial<ResolvedClinic["fields"]> = {}): ResolvedClinic {
  return {
    seed: { id, name: "Clinic 1", orgNoSeed: null, website: "https://c.se", city: "Stockholm", county: null, segment: "tandvard" },
    fields: { ...emptyFields(), ...overrides },
    sourcesChecked: [],
    sourcesSkipped: [],
    processingErrors: [],
  };
}

describe("runGoldSetEvaluation — scalar field null-handling", () => {
  it("counts a correct match as a true positive contributing to both precision and recall", () => {
    const gold = [goldRow({ phone: "+46812345678" })];
    const actual = [resolvedRow("c1", { phone: { value: "+46812345678", confidence: 0.8, conflict: false, evidence: [] } })];
    const report = runGoldSetEvaluation(gold, actual);
    const phone = report.perField.find((f) => f.field === "phone")!;
    expect(phone.truePositive).toBe(1);
    expect(phone.precision).toBe(1);
    expect(phone.recall).toBe(1);
  });

  it("counts a wrong value as BOTH a false positive and a false negative", () => {
    const gold = [goldRow({ phone: "+46812345678" })];
    const actual = [resolvedRow("c1", { phone: { value: "+46899999999", confidence: 0.8, conflict: false, evidence: [] } })];
    const report = runGoldSetEvaluation(gold, actual);
    const phone = report.perField.find((f) => f.field === "phone")!;
    expect(phone.falsePositive).toBe(1);
    expect(phone.falseNegative).toBe(1);
    expect(phone.precision).toBe(0);
    expect(phone.recall).toBe(0);
  });

  it("counts a missed field (gold has value, pipeline null) as a false negative only", () => {
    const gold = [goldRow({ phone: "+46812345678" })];
    const actual = [resolvedRow("c1")]; // phone stays null
    const report = runGoldSetEvaluation(gold, actual);
    const phone = report.perField.find((f) => f.field === "phone")!;
    expect(phone.falseNegative).toBe(1);
    expect(phone.falsePositive).toBe(0);
  });

  it("counts an unsupported claim (gold null, pipeline has a value) as a false positive only", () => {
    const gold = [goldRow({ phone: null })];
    const actual = [resolvedRow("c1", { phone: { value: "+46899999999", confidence: 0.5, conflict: false, evidence: [] } })];
    const report = runGoldSetEvaluation(gold, actual);
    const phone = report.perField.find((f) => f.field === "phone")!;
    expect(phone.falsePositive).toBe(1);
    expect(phone.falseNegative).toBe(0);
  });

  it("counts correct abstention (both null) as a true negative, not counted in precision/recall", () => {
    const gold = [goldRow({ phone: null })];
    const actual = [resolvedRow("c1")];
    const report = runGoldSetEvaluation(gold, actual);
    const phone = report.perField.find((f) => f.field === "phone")!;
    expect(phone.trueNegative).toBe(1);
    expect(phone.truePositive).toBe(0);
    expect(phone.falsePositive).toBe(0);
  });

  it("reports precision and recall as 0, not NaN, when there is no positive gold example", () => {
    const gold = [goldRow()];
    const actual = [resolvedRow("c1")];
    const report = runGoldSetEvaluation(gold, actual);
    for (const f of report.perField) {
      expect(Number.isNaN(f.precision)).toBe(false);
      expect(Number.isNaN(f.recall)).toBe(false);
    }
  });
});

describe("runGoldSetEvaluation — address and opening hours structural comparison", () => {
  it("matches an address by postal code + city even if street formatting would differ", () => {
    const gold = [goldRow({ visitingAddress: { postalCode: "111 22", city: "Stockholm" } })];
    const actual = [
      resolvedRow("c1", {
        visitingAddress: {
          value: { street: "Storgatan 12A", postalCode: "111 22", city: "Stockholm", raw: "Storgatan 12A, 111 22 Stockholm" },
          confidence: 0.7,
          conflict: false,
          evidence: [],
        },
      }),
    ];
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.perField.find((f) => f.field === "visitingAddress")!.truePositive).toBe(1);
  });

  it("matches opening hours by structured schedule, ignoring notes wording differences", () => {
    const gold = [goldRow({ openingHours: { 1: [{ opens: "08:00", closes: "17:00" }] } })];
    const actual = [
      resolvedRow("c1", {
        openingHours: {
          value: { byWeekday: { 1: [{ opens: "08:00", closes: "17:00" }] }, notes: "some unrelated note" },
          confidence: 0.7,
          conflict: false,
          evidence: [],
        },
      }),
    ];
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.perField.find((f) => f.field === "openingHours")!.truePositive).toBe(1);
  });
});

describe("runGoldSetEvaluation — services multi-label scoring", () => {
  it("gives partial credit for a partially-correct service list", () => {
    const gold = [goldRow({ services: ["Implantat", "Rotfyllning", "Tandreglering"] })];
    const actual = [resolvedRow("c1", { services: { value: ["Implantat", "Parodontologi"], confidence: 0.6, conflict: false, evidence: [] } })];
    const report = runGoldSetEvaluation(gold, actual);
    const services = report.perField.find((f) => f.field === "services")!;
    expect(services.truePositive).toBe(1); // Implantat
    expect(services.falseNegative).toBe(2); // Rotfyllning, Tandreglering missed
    expect(services.falsePositive).toBe(1); // Parodontologi not in gold
  });
});

describe("runGoldSetEvaluation — dental subsidy", () => {
  it("treats unknown-vs-unknown as a true negative", () => {
    const gold = [goldRow({ dentalSubsidy: "unknown" })];
    const actual = [resolvedRow("c1")]; // defaults to unknown
    const report = runGoldSetEvaluation(gold, actual);
    const subsidy = report.perField.find((f) => f.field === "dentalSubsidy")!;
    expect(subsidy.trueNegative).toBe(1);
  });

  it("scores a correct 'confirmed' as a true positive", () => {
    const gold = [goldRow({ dentalSubsidy: "confirmed" })];
    const actual = [resolvedRow("c1", { dentalSubsidy: { value: { status: "confirmed" }, confidence: 0.7, conflict: false, evidence: [] } })];
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.perField.find((f) => f.field === "dentalSubsidy")!.truePositive).toBe(1);
  });
});

describe("runGoldSetEvaluation — unmatched gold clinics", () => {
  it("reports a gold clinic missing from pipeline output instead of silently skipping it", () => {
    const gold = [goldRow({ clinicId: "not-in-pipeline-output" })];
    const actual = [resolvedRow("c1")];
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.unmatchedGoldClinicIds).toEqual(["not-in-pipeline-output"]);
    expect(report.matchedClinics).toBe(0);
  });

  it("matches a gold clinic by its labelled website when the seed name changed", () => {
    const gold = [goldRow({ clinicId: "old-name--stockholm", clinicName: "A-Dental AB, Stockholm", labelledFrom: "https://adental.se/kontakt" })];
    const actual = [
      resolvedRow("a-dental-ab-tdl-anna-gawska-ostermalm--ostermalm", {
        canonicalName: { value: "A-Dental AB", confidence: 0.8, conflict: false, evidence: [] },
      }),
    ];
    actual[0]!.seed.website = "https://adental.se";
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.matchedClinics).toBe(1);
    expect(report.identityDiagnostics[0]?.method).toBe("website_domain");
  });

  it("normalizes phone, organization number, and service labels", () => {
    const gold = [goldRow({ orgNumber: "556565-5957", phone: "08-660 62 94", services: ["Implantat"] })];
    const actual = [resolvedRow("c1", {
      orgNumber: { value: "5565655957", confidence: 0.8, conflict: false, evidence: [] },
      phone: { value: "+4686606294", confidence: 0.8, conflict: false, evidence: [] },
      services: { value: ["implantat"], confidence: 0.8, conflict: false, evidence: [] },
    })];
    const report = runGoldSetEvaluation(gold, actual);
    expect(report.perField.find((field) => field.field === "orgNumber")?.truePositive).toBe(1);
    expect(report.perField.find((field) => field.field === "phone")?.truePositive).toBe(1);
    expect(report.perField.find((field) => field.field === "services")?.truePositive).toBe(1);
  });
});