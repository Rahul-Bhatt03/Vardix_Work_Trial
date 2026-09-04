// This org-number.ts file does almost the same kind of job as phone.ts, but for Swedish organisation numbers.
// Swedish organisation numbers (organisationsnummer) have the form
// NNNNNN-NNNN (10 digits, hyphen after the 6th). The 10-digit sequence
// must pass a Luhn checksum, same algorithm as Swedish personnummer.
// Sole traders sometimes show a personnummer instead (also Luhn-valid,
// same shape, but with a birthdate-plausible first 6 digits) — we extract
// the shape and flag Luhn validity; distinguishing personnummer from
// organisationsnummer definitively requires registry lookup, which is out
// of scope for this extractor (see DECISIONS.md).

const ORG_NO_PATTERN = /\b(\d{6})[-\s]?(\d{4})\b/g;

export interface OrgNoCandidate {
  raw: string;
  normalized: string; // NNNNNN-NNNN
  luhnValid: boolean;
}

function luhnValid(tenDigits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(tenDigits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function extractOrgNoCandidates(text: string): OrgNoCandidate[] {
  const results: OrgNoCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(ORG_NO_PATTERN)) {
    const first = match[1];
    const second = match[2];
    if (!first || !second) continue;
    const digits = first + second;
    const normalized = `${first}-${second}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({ raw: match[0], normalized, luhnValid: luhnValid(digits) });
  }

  return results;
}

/** True if the string is already shaped like a normalized org number. */
export function isNormalizedOrgNo(s: string): boolean {
  return /^\d{6}-\d{4}$/.test(s);
}