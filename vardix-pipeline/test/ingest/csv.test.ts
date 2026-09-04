import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeedCsv, slugifyClinicId, validateSeedRows } from "../../src/ingest/csv.js";

const REAL_SEED_PATH = new URL("../../data/seed-clinics.csv", import.meta.url);

describe("parseSeedCsv against the real seed file", () => {
  const csv = readFileSync(REAL_SEED_PATH, "utf8");
  const clinics = parseSeedCsv(csv);

  it("parses all 300 clinic rows", () => {
    expect(clinics.length).toBe(300);
  });

  it("every clinic has a non-empty id, name and website", () => {
    for (const c of clinics) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.website).toMatch(/^https?:\/\//);
    }
  });

  it("ids are unique across the whole seed file", () => {
    const ids = new Set(clinics.map((c) => c.id));
    expect(ids.size).toBe(clinics.length);
  });

  it("preserves an empty org_no as null, not an empty string", () => {
    const withoutOrgNo = clinics.find((c) => c.orgNoSeed === null);
    expect(withoutOrgNo).toBeDefined();
  });

  it("keeps a real pre-filled org_no from the seed", () => {
    const bjuvs = clinics.find((c) => c.name.includes("Bjuvs Tandvårdsteam"));
    expect(bjuvs?.orgNoSeed).toBe("556680-6351");
  });

  it("classifies both known segments present in the seed", () => {
    const segments = new Set(clinics.map((c) => c.segment));
    expect(segments.has("tandvard")).toBe(true);
    expect(segments.has("hud")).toBe(true);
  });
});

describe("slugifyClinicId", () => {
  it("produces a URL-safe id from a name with Swedish characters", () => {
    const id = slugifyClinicId("Åhus Sundhtandvård", "Åhus");
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("is stable for the same input", () => {
    const a = slugifyClinicId("Alpha Dental", "Sundbyberg");
    const b = slugifyClinicId("Alpha Dental", "Sundbyberg");
    expect(a).toBe(b);
  });
});

describe("parseSeedCsv edge cases", () => {
  it("drops a row with no website and does not throw", () => {
    const csv = "name,org_no,website,city,county,segment\nGood Clinic,,https://good.se,Stockholm,,tandvard\nBad Row,,,Stockholm,,tandvard\n";
    const clinics = parseSeedCsv(csv);
    expect(clinics.length).toBe(1);
    expect(clinics[0]?.name).toBe("Good Clinic");
  });

  it("disambiguates two rows that would otherwise slugify to the same id", () => {
    const csv =
      "name,org_no,website,city,county,segment\n" +
      "Dental Clinic,,https://a.se,Lund,,tandvard\n" +
      "Dental Clinic,,https://b.se,Lund,,tandvard\n";
    const clinics = parseSeedCsv(csv);
    expect(clinics.length).toBe(2);
    expect(clinics[0]?.id).not.toBe(clinics[1]?.id);
  });
});

describe("validateSeedRows", () => {
  it("flags a website missing its scheme instead of silently accepting it", () => {
    const csv = "name,org_no,website,city,county,segment\nClinic,,adental.se,Stockholm,,tandvard\n";
    const issues = validateSeedRows(csv);
    expect(issues.some((i) => i.issue.includes("scheme"))).toBe(true);
  });

  it("reports no issues for a clean row", () => {
    const csv = "name,org_no,website,city,county,segment\nClinic,,https://adental.se,Stockholm,,tandvard\n";
    expect(validateSeedRows(csv)).toEqual([]);
  });
});