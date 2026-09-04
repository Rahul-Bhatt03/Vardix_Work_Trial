// Take the recruiter's seed-clinics.csv file and turn each CSV row into a structured SeedClinic object that the rest of our pipeline can work with.
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import type { SeedClinic } from "../model/types.js";

interface RawRow {
  name: string;
  org_no: string;
  website: string;
  city: string;
  county: string;
  segment: string;
}

/**
  Build a stable, URL-safe id for a clinic from its name and city. Used as the join key across the pipeline and in gold-set files, so it must not depend on row order (row order is not stable if the seed file is re-sorted or filtered).
 */
export function slugifyClinicId(name: string, city: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics for the id only; original strings keep å/ä/ö
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${norm(name)}--${norm(city)}`.slice(0, 120);
}

export function parseSeedCsv(csvText: string): SeedClinic[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as RawRow[];

  const seen = new Map<string, number>();
  const clinics: SeedClinic[] = [];

  for (const row of rows) {
    const name = row.name?.trim();
    const website = row.website?.trim();
    if (!name || !website) {
      // A row without a name or website cannot be processed by any source.
      // We drop it but this should be logged by the caller via validateSeedRows.
      continue;
    }
    const city = row.city?.trim() ?? "";
    let id = slugifyClinicId(name, city);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`; // disambiguate true duplicates

    clinics.push({
      id,
      name,
      orgNoSeed: row.org_no?.trim() || null,
      website,
      city,
      county: row.county?.trim() || null,
      segment: (row.segment?.trim() as SeedClinic["segment"]) || "unknown",
    });
  }

  return clinics;
}

export interface SeedValidationIssue {
  rowIndex: number;
  name: string | undefined;
  issue: string;
}

/**
  Reports rows that were skipped or are otherwise questionable, without throwing. The brief requires the pipeline to keep going when individual records are bad; this is the ingestion half of that rule.
 */
export function validateSeedRows(csvText: string): SeedValidationIssue[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as RawRow[];

  const issues: SeedValidationIssue[] = [];
  rows.forEach((row, i) => {
    if (!row.name?.trim()) issues.push({ rowIndex: i, name: row.name, issue: "missing name" });
    if (!row.website?.trim()) issues.push({ rowIndex: i, name: row.name, issue: "missing website" });
    else if (!/^https?:\/\//i.test(row.website.trim())) {
      issues.push({ rowIndex: i, name: row.name, issue: `website missing scheme: ${row.website}` });
    }
  });
  return issues;
}

export function loadSeedCsvFromFile(path: string): SeedClinic[] {
  return parseSeedCsv(readFileSync(path, "utf8"));
}