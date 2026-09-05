import type { AddressValue, OpeningHoursValue } from "../model/types.js";

export function stringEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function exactEquals(a: string, b: string): boolean {
  return a === b;
}

export function addressEquals(a: AddressValue, b: AddressValue): boolean {
  // A postal code + city match is a reliable enough signal of "same
  // address" even if street formatting differs slightly between sources
  // (e.g. "Storgatan 12" vs "Storgatan 12A"). If either side lacks a
  // postal code, fall back to a normalized raw-string comparison.
  if (a.postalCode && b.postalCode) {
    return a.postalCode === b.postalCode && (a.city ?? "").toLowerCase() === (b.city ?? "").toLowerCase();
  }
  return a.raw.trim().toLowerCase() === b.raw.trim().toLowerCase();
}

export function openingHoursEquals(a: OpeningHoursValue, b: OpeningHoursValue): boolean {
  // Compare the structured schedule only; free-text notes commonly differ
  // in wording between sources even when the schedule itself agrees, and
  // penalizing that as a "conflict" would be noise, not signal.
  const norm = (v: OpeningHoursValue) => JSON.stringify(v.byWeekday, Object.keys(v.byWeekday).sort());
  return norm(a) === norm(b);
}

export function servicesEquals(a: string[], b: string[]): boolean {
  const sa = [...a].sort().join("|");
  const sb = [...b].sort().join("|");
  return sa === sb;
}