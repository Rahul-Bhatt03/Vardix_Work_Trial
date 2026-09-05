import type { AddressValue, OpeningHoursValue } from "../model/types.js";

export function stringEquals(a: string, b: string): boolean {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return normalize(a) === normalize(b);
}

export function exactEquals(a: string, b: string): boolean {
  return a === b;
}

export function organizationNumberEquals(a: string, b: string): boolean {
  return a.replace(/\D/g, "") === b.replace(/\D/g, "");
}

export function phoneEquals(a: string, b: string): boolean {
  const digits = (value: string) => value.replace(/\D/g, "");
  const normalize = (value: string) => {
    const number = digits(value);
    if (number.startsWith("0046")) return `+46${number.slice(4)}`;
    if (number.startsWith("0")) return `+46${number.slice(1)}`;
    if (number.startsWith("46")) return `+${number}`;
    return number;
  };
  return normalize(a) === normalize(b);
}

export function urlEquals(a: string, b: string): boolean {
  try {
    const normalize = (value: string) => {
      const url = new URL(value);
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}`.toLowerCase();
    };
    return normalize(a) === normalize(b);
  } catch {
    return stringEquals(a, b);
  }
}

export function addressEquals(a: AddressValue, b: AddressValue): boolean {
  // A postal code + city match is a reliable enough signal of "same
  // address" even if street formatting differs slightly between sources
  // (e.g. "Storgatan 12" vs "Storgatan 12A"). If either side lacks a
  // postal code, fall back to a normalized raw-string comparison.
  const postal = (value: string) => value.replace(/\D/g, "");
  if (a.postalCode && b.postalCode) {
    return postal(a.postalCode) === postal(b.postalCode) && stringEquals(a.city ?? "", b.city ?? "");
  }
  return stringEquals(a.raw.replace(/\s+/g, " "), b.raw.replace(/\s+/g, " "));
}

export function openingHoursEquals(a: OpeningHoursValue, b: OpeningHoursValue): boolean {
  // Compare the structured schedule only; free-text notes commonly differ
  // in wording between sources even when the schedule itself agrees, and
  // penalizing that as a "conflict" would be noise, not signal.
  const norm = (v: OpeningHoursValue) => JSON.stringify(Object.keys(v.byWeekday).sort().map((day) => [day, v.byWeekday[Number(day) as 1 | 2 | 3 | 4 | 5 | 6 | 7]]));
  return norm(a) === norm(b);
}

export function servicesEquals(a: string[], b: string[]): boolean {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const sa = [...new Set(a.map(normalize))].sort().join("|");
  const sb = [...new Set(b.map(normalize))].sort().join("|");
  return sa === sb;
}