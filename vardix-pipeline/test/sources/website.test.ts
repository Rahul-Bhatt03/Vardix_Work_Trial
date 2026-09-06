import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WebsiteSource } from "../../src/sources/website.js";
import type { SeedClinic } from "../../src/model/types.js";

const ALFA_HTML = readFileSync(new URL("../fixtures/html/website/alfa-tandvard-homepage.html", import.meta.url), "utf8");

const clinic: SeedClinic = {
  id: "alfa",
  name: "Alfa Tandvårdskliniken",
  orgNoSeed: null,
  website: "https://alfatandvard.se",
  city: "Hässleholm",
  county: null,
  segment: "tandvard",
};

function fetched(body: string) {
  return { ok: true as const, url: clinic.website, status: 200, contentType: "text/html", body, fetchedAt: "2026-09-06T00:00:00.000Z" };
}

describe("WebsiteSource opening hours", () => {
  it("extracts normalized hours and reviewer-useful evidence from the fixture", () => {
    const evidence = new WebsiteSource().extract(clinic, fetched(ALFA_HTML));
    const hours = evidence.openingHours?.[0];
    expect(hours?.value).toMatchObject({
      byWeekday: {
        1: [{ opens: "08:00", closes: "17:00" }],
        4: [{ opens: "08:00", closes: "17:00" }],
        5: [{ opens: "08:00", closes: "15:00" }],
        6: [],
        7: [],
      },
    });
    expect(hours?.evidenceText).toContain("Mån-Tors");
    expect(hours?.extractionMethod).toBe("dom:heading-block+parseOpeningHours");
  });

  it("prefers valid JSON-LD opening hours when visible text is absent", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Dentist",
      openingHours: ["Mo-Fr 08:00-17:00"],
    })}</script></head><body><h1>Alfa Tandvårdskliniken</h1></body></html>`;
    const hours = new WebsiteSource().extract(clinic, fetched(html)).openingHours?.[0];
    expect(hours?.value).toMatchObject({ byWeekday: { 1: [{ opens: "08:00", closes: "17:00" }] } });
    expect(hours?.extractionMethod).toBe("jsonld:openingHours");
    expect(hours?.confidence).toBe(0.8);
  });

  it("extracts JSON-LD openingHoursSpecification with reviewer-useful evidence", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Dentist",
      openingHoursSpecification: { dayOfWeek: "https://schema.org/Monday", opens: "08:00", closes: "17:00" },
    })}</script></head><body><h1>Alfa Tandvårdskliniken</h1></body></html>`;
    const hours = new WebsiteSource().extract(clinic, fetched(html)).openingHours?.[0];
    expect(hours?.extractionMethod).toBe("jsonld:openingHoursSpecification");
    expect(hours?.evidenceText).toContain("Monday");
  });
});
