// Swedish phone numbers appear in a handful of common written forms on
// clinic sites:
//   08-123 456 78          (Stockholm area code, space-grouped subscriber no.)
//   08-123 45 67
//   010-123 45 67           (non-geographic 010/013 ranges)
//   070-123 45 67           (mobile)
//   +46 8 123 456 78        (international)
//   0046701234567           (international written as 00-prefix)
// This module finds candidates in raw text. `raw` is the source-faithful
// value for evidence/output; `normalized` is only a comparison key.

export interface PhoneCandidate {
  raw: string;
  normalized: string; // E.164 comparison key, e.g. +46812345678
}

// Area/prefix codes are 1-4 digits (e.g. 8 for Stockholm, 031 for Gothenburg, 010/013 non-geographic). We deliberately do not try to validate against the real Swedish numbering plan (out of scope) — we validate shape and length only, and rely on source diversity for confidence.
const PHONE_PATTERN = /(?<!\d)(?:(?:\+46|0046)\s*\d{1,3}|0(?:10|7\d|[1-9]\d?))[\s().-]*\d(?:[\d\s().-]*\d)(?!\d)|(?<!\d)\d{7,9}(?!\d)/g;

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Returns an E.164-like comparison key without changing the stored source value. */
export function normalizePhoneForComparison(value: string): string {
  const digits = onlyDigits(value);
  if (digits.startsWith("0046")) return `+46${digits.slice(4)}`;
  if (digits.startsWith("46") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("0")) return `+46${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 9) return `+46${digits}`;
  return value.trim();
}

// Searches common Swedish phone formats and returns the original match plus
// a comparison key. Bare 7-9 digit values are accepted because some source
// pages publish a local number without a trunk or country prefix.
export function extractPhoneCandidates(text: string): PhoneCandidate[] {
  const results: PhoneCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PHONE_PATTERN)) {
    const raw = match[0].trim();

    const normalized = normalizePhoneForComparison(raw);
    const normalizedDigits = onlyDigits(normalized);
    if (!normalized.startsWith("+46") || normalizedDigits.length < 9 || normalizedDigits.length > 11) continue;
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