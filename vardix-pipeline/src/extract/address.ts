import type { AddressValue } from "../model/types.js";

// Swedish addresses in running text typically look like:
//   Storgatan 12, 111 22 Stockholm
//   Kungsgatan 5A
//   112 22 Stockholm
// Postal code is always "NNN NN" (5 digits, space after 3rd). Street lines
// commonly end in -gatan, -vägen, -torg, -gränd, -plan, -allé, but we do
// not require that suffix since many street names do not follow it
// (numbers, person names, etc.) — the postal code is the more reliable
// anchor.

const POSTAL_CODE_PATTERN = /\b(\d{3})\s?(\d{2})\s+([A-ZÅÄÖ][a-zåäö]+(?:[- ][A-ZÅÄÖ][a-zåäö]+)*)/g;

// A street line: starts with a capitalized word, ends with a house number
// (possibly with a letter suffix like "12A" or a range "12-14").
const STREET_LINE_PATTERN = /\b([A-ZÅÄÖ][a-zåäö]+(?:s?(?:gatan|vägen|torg|gränd|plan|allé|stigen|backe))?(?:\s[A-ZÅÄÖ][a-zåäö]+)*)\s+(\d{1,3}\s?[A-Za-z]?(?:-\d{1,3}[A-Za-z]?)?)\b/;

export function extractAddressCandidates(text: string): AddressValue[] {
  const results: AddressValue[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(POSTAL_CODE_PATTERN)) {
    const postalCode = `${match[1]} ${match[2]}`;
    const city = match[3]?.trim().replace(/[,.]$/, "");
    if (!city) continue;

    // Look backward up to ~80 chars from the match for a street line.
    const start = Math.max(0, match.index - 80);
    const context = text.slice(start, match.index);
    const streetMatch = context.match(STREET_LINE_PATTERN);
    const street = streetMatch ? `${streetMatch[1]} ${streetMatch[2]}` : undefined;

    const raw = street ? `${street}, ${postalCode} ${city}` : `${postalCode} ${city}`;
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({ street, postalCode, city, raw });
  }

  return results;
}