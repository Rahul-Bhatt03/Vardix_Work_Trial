// subsidy.ts searches for explicit evidence that a clinic participates in Sweden's dental subsidy system, while avoiding the unsafe assumption that simply being a dental clinic means it accepts the subsidy.

import type { DentalSubsidyStatus } from "../model/types.js";

const POSITIVE_PATTERNS = [
  /statlig[t]?\s+tandvårdsstöd/i,
  /tandvårdsstödet/i,
  /ansluten[a]?\s+till\s+tandvårdsstödet/i,
  /tandvårdsbidrag/i,
  /allmänt\s+tandvårdsbidrag/i,
  /\bATB\b/, 
  /särskilt\s+tandvårdsbidrag/i,
  /\bSTB\b/,
  /frisktandvård/i, 
];

// These patterns indicate that the clinic does not accept the subsidy.
const NEGATIVE_PATTERNS = [/tar\s+(?:ej|inte)\s+emot\s+tandvårdsbidrag/i, /endast\s+privatbetalande/i];

export interface SubsidyMatch {
  status: DentalSubsidyStatus;
  matchedText: string;
}

/**
* Looks for explicit subsidy-related statements in the source text.
 * A positive match means the text mentions the Swedish dental subsidy.
 * A negative match means the clinic says that it does not accept it.
 * The function only finds evidence. It does not guess the final status.
 */
export function detectDentalSubsidyMentions(text: string): SubsidyMatch[] {
  const matches: SubsidyMatch[] = [];
//  Check for statements saying that the clinic does not accept the dental subsidy.
  for (const pattern of NEGATIVE_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push({ status: "not_found", matchedText: m[0] });
  }

  // Check for explicit mentions of the dental subsidy scheme.
  for (const pattern of POSITIVE_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push({ status: "confirmed", matchedText: m[0] });
  }

  return matches;
}