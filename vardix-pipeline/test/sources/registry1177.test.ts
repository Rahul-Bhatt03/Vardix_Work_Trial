import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guess1177Url, Registry1177Source } from "../../src/sources/registry1177.js";
import type { SeedClinic, OpeningHoursValue } from "../../src/model/types.js";

const FJARAS_HTML = readFileSync(new URL("../fixtures/html/1177/fjarastandlakarn-1177.html", import.meta.url), "utf8");
const BJUVS_HTML = readFileSync(new URL("../fixtures/html/1177/bjuvs-tandvardsteam-1177.html", import.meta.url), "utf8");

const fjaras: SeedClinic = {
  id: "fjaras",
  name: "Fjäråstandläkarn Lindskogs Tandland AB",
  orgNoSeed: null,
  website: "https://fjarastandlakarn.se",
  city: "Kungsbacka",
  county: null,
  segment: "tandvard",
};

const bjuvs: SeedClinic = {
  id: "bjuvs",
  name: "Bjuvs Tandvårdsteam AB",
  orgNoSeed: "556680-6351",
  website: "https://bjuvstandvardsteam.se",
  city: "Bjuv",
  county: null,
  segment: "tandvard",
};

function fetched(body: string, url: string) {
  return { ok: true as const, url, status: 200, contentType: "text/html", body, fetchedAt: new Date().toISOString() };
}

describe("guess1177Url", () => {
  it("matches the real observed 1177 URL pattern for a known clinic", () => {
    // Real observed URL: /hitta-vard/kontaktkort/Bjuvs-Tandvardsteam-AB-Bjuv/
    expect(guess1177Url(bjuvs)).toBe("https://www.1177.se/hitta-vard/kontaktkort/Bjuvs-Tandvardsteam-AB-Bjuv/");
  });

  it("transliterates Swedish diacritics", () => {
    expect(guess1177Url(fjaras)).toContain("Fjarastandlakarn");
    expect(guess1177Url(fjaras)).not.toContain("å");
  });
});

describe("Registry1177Source.extract", () => {
  const source = new Registry1177Source();

  it("extracts phone, hours, address, services and subsidy status from a matching real page", () => {
    const ev = source.extract(fjaras, fetched(FJARAS_HTML, guess1177Url(fjaras)));
    expect(ev.phone?.[0]?.value).toBe("+46300543154");
    expect(ev.visitingAddress?.[0]?.value).toMatchObject({ city: "Kungsbacka" });
    const hours = ev.openingHours?.[0]?.value as OpeningHoursValue | undefined;
    expect(hours?.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(hours?.byWeekday[6]).toEqual([]); // Lördag stängt
    expect(ev.services?.[0]?.value).toContain("Implantat");
  });

  it("reads the Öppettider table, not the Telefontider table, when they genuinely differ", () => {
    const ev = source.extract(bjuvs, fetched(BJUVS_HTML, guess1177Url(bjuvs)));
    const hours = ev.openingHours?.[0]?.value as OpeningHoursValue | undefined;
    // Real data: Telefontider Monday is 08.00–18.00, Öppettider Monday is
    // 07.45–18.00. If the extractor grabbed the wrong table this would be 08:00.
    expect(hours?.byWeekday[1]).toEqual([{ opens: "07:45", closes: "18:00" }]);
    expect(hours?.byWeekday[3]).toEqual([{ opens: "07:30", closes: "13:00" }]);
  });

  it("returns no evidence when the fetched page does not match the seed clinic", () => {
    // Simulate a wrong guess landing on an unrelated clinic's page.
    const unrelated: SeedClinic = { ...fjaras, name: "Totally Different Clinic Name", city: "Totally Different City" };
    const ev = source.extract(unrelated, fetched(FJARAS_HTML, guess1177Url(unrelated)));
    expect(ev).toEqual({});
  });

  it("emits the verified page heading as canonicalName evidence", () => {
    const ev = source.extract(bjuvs, fetched(BJUVS_HTML, guess1177Url(bjuvs)));
    expect(ev.canonicalName?.[0]?.value).toBe("Bjuvs Tandvårdsteam AB, Bjuv");
    expect(ev.canonicalName?.[0]?.extractionMethod).toContain("name-match-verified");
  });

  it("does not fabricate a dental subsidy claim when Om oss never mentions the subsidy scheme", () => {
    const ev = source.extract(fjaras, fetched(FJARAS_HTML, guess1177Url(fjaras)));
    expect(ev.dentalSubsidy).toBeUndefined();
  });
});