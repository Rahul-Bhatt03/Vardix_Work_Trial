import type { GoldClinic } from "./goldset.js";
import type { ResolvedClinic } from "../model/types.js";

export type IdentityMatchMethod = "stable_id" | "organization_number" | "website_domain" | "name_and_city";

export interface IdentityMatch {
  clinic: ResolvedClinic;
  method: IdentityMatchMethod;
  score: number;
  details: string;
}

export function normalizeOrganizationNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeDomain(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").split(/[/?#]/)[0] ?? "";
  }
}

export function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeIdentityText(value).split(/\s+/).filter((token) => token.length > 1));
}

function goldDomain(gold: GoldClinic): string | null {
  const labels = Array.isArray(gold.labelledFrom) ? gold.labelledFrom : [gold.labelledFrom];
  for (const label of labels) {
    const match = label.match(/https?:\/\/[^\s,/)]+/i);
    if (match) return normalizeDomain(match[0]);
  }
  return null;
}

function goldNameAndCity(gold: GoldClinic): { name: string; city: string } {
  const comma = gold.clinicName.lastIndexOf(",");
  return comma === -1
    ? { name: gold.clinicName, city: "" }
    : { name: gold.clinicName.slice(0, comma), city: gold.clinicName.slice(comma + 1) };
}

function nameAndCityMatch(gold: GoldClinic, clinic: ResolvedClinic): boolean {
  const goldParts = goldNameAndCity(gold);
  const goldCity = normalizeIdentityText(goldParts.city);
  const actualCity = normalizeIdentityText(clinic.seed.city);
  if (!goldCity || goldCity !== actualCity) return false;

  const goldTokens = tokens(goldParts.name);
  const actualTokens = tokens(clinic.seed.name);
  if (goldTokens.size === 0 || actualTokens.size === 0) return false;
  const shared = [...goldTokens].filter((token) => actualTokens.has(token)).length;
  return shared >= 2 && shared / Math.min(goldTokens.size, actualTokens.size) >= 0.75;
}

export function matchGoldClinic(gold: GoldClinic, clinics: ResolvedClinic[]): IdentityMatch | null {
  const byId = clinics.find((clinic) => clinic.seed.id === gold.clinicId);
  if (byId) return { clinic: byId, method: "stable_id", score: 1, details: "Gold clinicId equals preserved seed clinic ID." };

  const goldOrg = normalizeOrganizationNumber(gold.orgNumber);
  if (goldOrg) {
    const byOrg = clinics.filter((clinic) => {
      const actualOrg = normalizeOrganizationNumber(clinic.fields.orgNumber.value ?? clinic.seed.orgNoSeed);
      return actualOrg === goldOrg;
    });
    if (byOrg.length === 1) return { clinic: byOrg[0]!, method: "organization_number", score: 0.98, details: "Unique normalized organization number match." };
  }

  const domain = goldDomain(gold);
  if (domain) {
    const byDomain = clinics.filter((clinic) => normalizeDomain(clinic.seed.website) === domain);
    if (byDomain.length === 1) return { clinic: byDomain[0]!, method: "website_domain", score: 0.95, details: `Unique labelled-source domain match: ${domain}.` };
  }

  const byNameAndCity = clinics.filter((clinic) => nameAndCityMatch(gold, clinic));
  if (byNameAndCity.length === 1) return { clinic: byNameAndCity[0]!, method: "name_and_city", score: 0.85, details: "Unique normalized clinic-name and city match." };
  return null;
}
