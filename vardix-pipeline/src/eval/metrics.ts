import type { ResolvedClinic } from "../model/types.js";
import type { GoldClinic } from "./goldset.js";
import { addressEquals, openingHoursEquals, stringEquals } from "../resolve/equality.js";
import { matchGoldClinic, normalizeDomain, normalizeOrganizationNumber } from "./identity.js";

// Null-handling rule for scoring (see goldset.ts for the labelling-side
// rule this depends on):
//
//   gold=value, pipeline=matching value   -> true positive
//   gold=value, pipeline=different value  -> counts as BOTH a false
//                                             positive (asserted a wrong
//                                             value) and a false negative
//                                             (missed the correct one) —
//                                             a confidently wrong answer
//                                             is worse than silence, and
//                                             this scoring reflects that
//   gold=value, pipeline=null             -> false negative (missed)
//   gold=null,   pipeline=value           -> false positive (unsupported
//                                             claim on a field that is
//                                             genuinely not available)
//   gold=null,   pipeline=null            -> true negative (correct
//                                             abstention; not counted in
//                                             precision/recall, tracked
//                                             separately)
//
// precision = TP / (TP + FP); recall = TP / (TP + FN). Both are reported
// as 0 (not NaN) with the raw counts alongside when a denominator is 0,
// so a field with no positive gold examples is visibly distinguishable
// from a field that scored 0.

export interface FieldMetric {
  field: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number;
  recall: number;
  goldCount: number; // number of gold clinics with a non-null gold value for this field
}

export interface GoldSetEvalReport {
  evaluatedAt: string;
  goldSetSize: number;
  matchedClinics: number; // gold clinics that were found in the pipeline output
  unmatchedGoldClinicIds: string[]; // gold clinics not present in pipeline output — reported, not silently skipped
  identityDiagnostics: { goldClinicId: string; matchedPipelineId?: string; method?: string; details: string }[];
  perField: FieldMetric[];
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0046")) return `+46${digits.slice(4)}`;
  if (digits.startsWith("46") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("0")) return `+46${digits.slice(1)}`;
  return value.trim();
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${normalizeDomain(url.hostname)}${url.pathname}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function scalarMatch(gold: string | null, actual: string | null, equals: (a: string, b: string) => boolean): "tp" | "fp" | "fn" | "fp+fn" | "tn" {
  if (gold === null && actual === null) return "tn";
  if (gold === null && actual !== null) return "fp";
  if (gold !== null && actual === null) return "fn";
  return equals(gold!, actual!) ? "tp" : "fp+fn";
}

function tally(outcome: ReturnType<typeof scalarMatch>, m: FieldMetric): void {
  if (outcome === "tp") m.truePositive++;
  else if (outcome === "fp") m.falsePositive++;
  else if (outcome === "fn") m.falseNegative++;
  else if (outcome === "tn") m.trueNegative++;
  else {
    m.falsePositive++;
    m.falseNegative++;
  }
}

function finalizeMetric(m: FieldMetric): void {
  m.precision = m.truePositive + m.falsePositive > 0 ? m.truePositive / (m.truePositive + m.falsePositive) : 0;
  m.recall = m.truePositive + m.falseNegative > 0 ? m.truePositive / (m.truePositive + m.falseNegative) : 0;
}

function emptyMetric(field: string): FieldMetric {
  return { field, truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0, precision: 0, recall: 0, goldCount: 0 };
}

export function runGoldSetEvaluation(goldSet: GoldClinic[], resolvedClinics: ResolvedClinic[]): GoldSetEvalReport {
  const metrics: Record<string, FieldMetric> = {
    canonicalName: emptyMetric("canonicalName"),
    orgNumber: emptyMetric("orgNumber"),
    visitingAddress: emptyMetric("visitingAddress"),
    phone: emptyMetric("phone"),
    email: emptyMetric("email"),
    openingHours: emptyMetric("openingHours"),
    services: emptyMetric("services"),
    dentalSubsidy: emptyMetric("dentalSubsidy"),
    bookingUrl: emptyMetric("bookingUrl"),
  };

  const unmatched: string[] = [];
  const identityDiagnostics: GoldSetEvalReport["identityDiagnostics"] = [];
  let matched = 0;

  for (const gold of goldSet) {
    const identity = matchGoldClinic(gold, resolvedClinics);
    if (!identity) {
      unmatched.push(gold.clinicId);
      identityDiagnostics.push({ goldClinicId: gold.clinicId, details: "No unique match by stable ID, organization number, labelled-source domain, or normalized name + city." });
      continue;
    }
    const actual = identity.clinic;
    identityDiagnostics.push({ goldClinicId: gold.clinicId, matchedPipelineId: actual.seed.id, method: identity.method, details: identity.details });
    matched++;

    if (gold.canonicalName !== null) metrics.canonicalName!.goldCount++;
    tally(scalarMatch(gold.canonicalName, actual.fields.canonicalName.value, stringEquals), metrics.canonicalName!);

    if (gold.orgNumber !== null) metrics.orgNumber!.goldCount++;
    tally(scalarMatch(gold.orgNumber, actual.fields.orgNumber.value, (a, b) => normalizeOrganizationNumber(a) === normalizeOrganizationNumber(b)), metrics.orgNumber!);

    if (gold.phone !== null) metrics.phone!.goldCount++;
    tally(scalarMatch(gold.phone, actual.fields.phone.value, (a, b) => normalizePhone(a) === normalizePhone(b)), metrics.phone!);

    if (gold.email !== null) metrics.email!.goldCount++;
    tally(scalarMatch(gold.email, actual.fields.email.value, stringEquals), metrics.email!);

    if (gold.bookingUrl !== null) metrics.bookingUrl!.goldCount++;
    tally(scalarMatch(gold.bookingUrl, actual.fields.bookingUrl.value, (a, b) => normalizeUrl(a) === normalizeUrl(b)), metrics.bookingUrl!);

    // Address: compare via the same postal-code+city equality the resolver uses.
    if (gold.visitingAddress !== null) metrics.visitingAddress!.goldCount++;
    const actualAddr = actual.fields.visitingAddress.value;
    const addrOutcome =
      gold.visitingAddress === null && actualAddr === null
        ? "tn"
        : gold.visitingAddress === null && actualAddr !== null
          ? "fp"
          : gold.visitingAddress !== null && actualAddr === null
            ? "fn"
            : addressEquals(
                  { raw: "", postalCode: gold.visitingAddress!.postalCode, city: gold.visitingAddress!.city },
                  actualAddr!,
                )
              ? "tp"
              : "fp+fn";
    tally(addrOutcome, metrics.visitingAddress!);

    // Opening hours: compare structured schedule only, same as the resolver's own equality.
    if (gold.openingHours !== null) metrics.openingHours!.goldCount++;
    const actualHours = actual.fields.openingHours.value;
    const hoursOutcome =
      gold.openingHours === null && actualHours === null
        ? "tn"
        : gold.openingHours === null && actualHours !== null
          ? "fp"
          : gold.openingHours !== null && actualHours === null
            ? "fn"
            : openingHoursEquals({ byWeekday: gold.openingHours! }, actualHours!)
              ? "tp"
              : "fp+fn";
    tally(hoursOutcome, metrics.openingHours!);

    // Dental subsidy: exact status match. "unknown" on both sides counts
    // as a true negative (correct abstention), consistent with the rest
    // of this table, since "unknown" is this field's null.
    const goldSubsidy = gold.dentalSubsidy === "unknown" ? null : gold.dentalSubsidy;
    const actualSubsidyRaw = actual.fields.dentalSubsidy.value?.status ?? "unknown";
    const actualSubsidy = actualSubsidyRaw === "unknown" ? null : actualSubsidyRaw;
    if (goldSubsidy !== null) metrics.dentalSubsidy!.goldCount++;
    tally(scalarMatch(goldSubsidy, actualSubsidy, (a, b) => a === b), metrics.dentalSubsidy!);

    // Services: multi-label set. Each gold service is its own TP/FN;
    // each predicted service not in gold is its own FP. This is scored
    // per-item rather than per-clinic because "half the services right"
    // is real partial credit, not a binary pass/fail.
    if (gold.services !== null && gold.services.length > 0) {
      metrics.services!.goldCount += gold.services.length;
      const normalizeService = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const goldSet = new Set(gold.services.map(normalizeService));
      const actualSet = new Set((actual.fields.services.value ?? []).map(normalizeService));
      for (const s of goldSet) {
        if (actualSet.has(s)) metrics.services!.truePositive++;
        else metrics.services!.falseNegative++;
      }
      for (const s of actualSet) {
        if (!goldSet.has(s)) metrics.services!.falsePositive++;
      }
    } else if (gold.services !== null && gold.services.length === 0) {
      const actualSet = actual.fields.services.value ?? [];
      if (actualSet.length === 0) metrics.services!.trueNegative++;
      else metrics.services!.falsePositive += actualSet.length;
    }
  }

  for (const m of Object.values(metrics)) finalizeMetric(m);

  return {
    evaluatedAt: new Date().toISOString(),
    goldSetSize: goldSet.length,
    matchedClinics: matched,
    unmatchedGoldClinicIds: unmatched,
    identityDiagnostics,
    perField: Object.values(metrics),
  };
}