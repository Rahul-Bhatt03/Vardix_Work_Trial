import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WebsiteSource } from "../../src/sources/website.js";
import type { SeedClinic } from "../../src/model/types.js";
import { processClinic } from "../../src/pipeline.js";
import { PoliteFetcher } from "../../src/sources/fetcher.js";

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
    expect(evidence.phone?.[0]?.value).toBe("0451-123 456");
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

  it("discovers relevant internal booking pages after the homepage", () => {
    expect(new WebsiteSource().discover(clinic)).toEqual([
      "https://alfatandvard.se",
      "https://alfatandvard.se/kontakt",
      "https://alfatandvard.se/boka",
      "https://alfatandvard.se/booking",
      "https://alfatandvard.se/tidsbokning",
    ]);
  });

  it("crawls an internal booking page when the homepage has no destination", async () => {
    const fetchFn = async (input: string | URL | Request): Promise<Response> => {
      const value = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (value.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
      if (value.endsWith("/boka")) return new Response('<html><body><a href="https://frenda.se/clinic/123">Boka tid</a></body></html>', { status: 200 });
      return new Response("<html><body><h1>Alfa Tandvårdskliniken</h1></body></html>", { status: 200 });
    };
    const result = await processClinic(clinic, {
      sources: [new WebsiteSource()],
      fetcher: new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 }),
    });
    expect(result.fields.bookingUrl.value).toBe("https://frenda.se/clinic/123");
  });

  it("finds external, button, onclick, and data-attribute booking destinations", () => {
    const html = `<html><body>
      <button data-booking-url="https://booking.frenda.se/clinic/123" aria-label="Boka besök">Boka besök</button>
      <button onclick="window.location='/boka-tid'">Book appointment</button>
      <div data-url="https://clinic.example/schedule" aria-label="Schedule appointment"></div>
    </body></html>`;
    const evidence = new WebsiteSource().extract(clinic, fetched(html));
    expect(evidence.bookingUrl?.[0]?.value).toBe("https://booking.frenda.se/clinic/123");
  });

  it("does not turn generic or invalid links into booking URLs", () => {
    const html = `<html><body>
      <a href="/kontakt">Kontakt</a>
      <a href="javascript:void(0)">Boka</a>
      <a href="https://example.com/services">Services</a>
    </body></html>`;
    expect(new WebsiteSource().extract(clinic, fetched(html)).bookingUrl).toBeUndefined();
  });
});
