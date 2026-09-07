import type { DentalSubsidyValue, FieldEvidence, ResolvedField } from "../model/types.js";

/**
 * The brief requires distinguishing "not found" from "unknown": not_found
 * means we looked and found no mention; unknown means we have no
 * dental-relevant evidence to check at all (e.g. every source for this
 * clinic failed to fetch). This resolver only ever sees evidence that WAS
 * produced by a source, so it returns "unknown" only when there is no
 * evidence at all — the caller is responsible for not calling this when
 * the clinic is not a dental clinic in the first place (see cli/pipeline).
 */
export function resolveDentalSubsidy(evidence: FieldEvidence<DentalSubsidyValue>[]): ResolvedField<DentalSubsidyValue> {
  const withValues = evidence.filter((e): e is FieldEvidence<DentalSubsidyValue> & { value: DentalSubsidyValue } => e.value !== null);

  if (withValues.length === 0) {
    return { value: { status: "unknown" }, confidence: 0, conflict: false, evidence };
  }

  const confirmed = withValues.filter((e) => e.value.status === "confirmed");
  const notFound = withValues.filter((e) => e.value.status === "not_found");

  if (confirmed.length > 0 && notFound.length > 0) {
    const bestConfidence = Math.max(...withValues.map((e) => e.confidence));
    return {
      value: { status: "conflicting" },
      confidence: bestConfidence,
      conflict: true,
      resolutionNote: `${confirmed.length} source(s) confirmed a state dental subsidy connection while ${notFound.length} source(s) found no mention or an explicit denial. Reporting as conflicting rather than picking a side.`,
      evidence,
    };
  }

  if (confirmed.length > 0) {
    const best = confirmed.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return { value: { status: "confirmed" }, confidence: best.confidence, conflict: false, evidence };
  }

  // Only not_found evidence.
  const best = notFound.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return { value: { status: "not_found" }, confidence: best.confidence, conflict: false, evidence };
}