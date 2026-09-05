// Swedish phone numbers appear in a handful of common written forms on
// clinic sites:
//   08-123 456 78          (Stockholm area code, space-grouped subscriber no.)
//   08-123 45 67
//   010-123 45 67           (non-geographic 010/013 ranges)
//   070-123 45 67           (mobile)
//   +46 8 123 456 78        (international)
//   0046701234567           (international written as 00-prefix)
// This module finds candidates in raw text and normalizes each to E.164
// (+46...) for comparison/storage, while keeping the original text as
// evidence.

export interface PhoneCandidate {
  raw: string;
  normalized: string; // E.164, e.g. +46812345678
}

// Area/prefix codes are 1-4 digits (e.g. 8 for Stockholm, 031 for Gothenburg, 010/013 non-geographic). We deliberately do not try to validate against the real Swedish numbering plan (out of scope) — we validate shape and length only, and rely on source diversity for confidence.
const PHONE_PATTERN = /(?<!\d)(?:(?:\+46|0046)\s*\d{1,3}|0(?:10|7\d|[1-9]\d?))[\s().-]*\d(?:[\d\s().-]*\d)(?!\d)/g;

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

// searches for common Swedish phone formats,eg:  "Call us: 08-123 45 67 or 070-123 45 67" and return approximately normalized phone numbers in E.164 format (+46...) along with the original text as evidence.
export function extractPhoneCandidates(text: string): PhoneCandidate[] {
  const results: PhoneCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PHONE_PATTERN)) {
    const raw = match[0].trim();
    const digits = onlyDigits(raw);

    // Normalize to national significant number (drop leading 46/0046/0).
    let nsn = digits;
    if (nsn.startsWith("0046")) nsn = nsn.slice(4);
    else if (nsn.startsWith("46") && digits.length > 9) nsn = nsn.slice(2);
    else if (nsn.startsWith("0")) nsn = nsn.slice(1);

    // Swedish national significant numbers are 7-9 digits.
    if (nsn.length < 7 || nsn.length > 9) continue;

    const normalized = `+46${nsn}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({ raw, normalized });
  }

  return results;
}

/** Formats a normalized +46 number back into a common Swedish display form for evidence text, not for storage. */
export function formatSwedishDisplay(normalized: string): string {
  const nsn = normalized.replace(/^\+46/, "");
  return `0${nsn}`;
}