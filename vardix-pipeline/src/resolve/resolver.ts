import type { FieldEvidence, ResolvedField } from "../model/types.js";

export interface ResolveOptions<T> {
  equals: (a: T, b: T) => boolean;
  /** Confidence added per additional distinct source type that agrees, capped at 0.99 total. Default 0.15. */
  agreementBonus?: number;
  /** How to render a value in the conflict explanation. Default JSON.stringify. */
  describe?: (v: T) => string;
}

const DEFAULT_AGREEMENT_BONUS = 0.15;

/**
  Merges evidence for one field across however many sources produced it. The rule this implements: confidence rewards independent agreement, not just a single confident-sounding source, and any real disagreement between sources is recorded — never silently overwritten — per the brief's evidence-first requirement.
 */
export function resolveField<T>(evidence: FieldEvidence<T>[], opts: ResolveOptions<T>): ResolvedField<T> {
  const describe = opts.describe ?? ((v: T) => JSON.stringify(v));
  const withValues = evidence.filter((e): e is FieldEvidence<T> & { value: T } => e.value !== null);

  if (withValues.length === 0) {
    return { value: null, confidence: 0, conflict: false, evidence };
  }

  const groups: { value: T; items: (FieldEvidence<T> & { value: T })[] }[] = [];
  for (const e of withValues) {
    const group = groups.find((g) => opts.equals(g.value, e.value));
    if (group) group.items.push(e);
    else groups.push({ value: e.value, items: [e] });
  }

  const scored = groups.map((g) => {
    const distinctSourceTypes = new Set(g.items.map((i) => i.sourceType)).size;
    const maxConfidence = Math.max(...g.items.map((i) => i.confidence));
    const bonus = distinctSourceTypes > 1 ? (opts.agreementBonus ?? DEFAULT_AGREEMENT_BONUS) * (distinctSourceTypes - 1) : 0;
    return { ...g, score: Math.min(0.99, maxConfidence + bonus) };
  });
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const conflict = scored.length > 1;

  let resolutionNote: string | undefined;
  if (conflict) {
    const bestSources = [...new Set(best.items.map((i) => i.sourceType))].join(", ");
    const others = scored
      .slice(1)
      .map((g) => `${describe(g.value)} (from ${[...new Set(g.items.map((i) => i.sourceType))].join(", ")}, confidence ${g.score.toFixed(2)})`)
      .join("; ");
    resolutionNote = `${scored.length} distinct values reported. Chose ${describe(best.value)} (confidence ${best.score.toFixed(2)}, from ${bestSources}) as highest-confidence. Other values seen: ${others}.`;
  }

  return {
    value: best.value,
    confidence: best.score,
    conflict,
    conflictCategory: conflict ? "source_disagreement" : undefined,
    resolutionNote,
    evidence,
  };
}