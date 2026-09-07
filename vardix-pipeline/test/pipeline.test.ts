import { describe, expect, it, vi } from "vitest";
import { processClinic, processClinics } from "../src/pipeline.js";
import type { SeedClinic } from "../src/model/types.js";
import type { RawEvidence, Source } from "../src/sources/types.js";
import { PoliteFetcher } from "../src/sources/fetcher.js";

const clinic: SeedClinic = {
  id: "test-clinic",
  name: "Test Clinic",
  orgNoSeed: null,
  website: "https://test.example",
  city: "Stockholm",
  county: null,
  segment: "tandvard",
};

function fakeSource(name: string, evidence: RawEvidence, urls: string[] = ["https://test.example"]): Source {
  return {
    name,
    sourceType: "clinic_website",
    discover: () => urls,
    extract: () => evidence,
  };
}

function fakeFetcher(ok: boolean, body = "<html></html>") {
  const fetchFn = vi.fn(async (url: string | URL) => {
    if (url.toString().endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
    return ok ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  return new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 });
}

describe("processClinic", () => {
  it("collects evidence from a successful source and resolves it into fields", async () => {
    const source = fakeSource("test-source", {
      phone: [{ value: "+46812345678", sourceUrl: "https://test.example", sourceType: "clinic_website", confidence: 0.8, retrievedAt: "2026-09-04T00:00:00.000Z", extractionMethod: "test" }],
    });
    const result = await processClinic(clinic, { sources: [source], fetcher: fakeFetcher(true) });
    expect(result.fields.phone.value).toBe("+46812345678");
    expect(result.sourcesChecked).toContain("https://test.example");
    expect(result.processingErrors).toEqual([]);
  });

  it("records a skipped source and still returns a valid (mostly-null) resolved clinic", async () => {
    const source = fakeSource("test-source", {});
    const result = await processClinic(clinic, { sources: [source], fetcher: fakeFetcher(false) });
    expect(result.sourcesSkipped.length).toBe(1);
    expect(result.sourcesSkipped[0]?.reason).toBe("not_found");
    expect(result.fields.phone.value).toBeNull();
  });

  it("does not let one throwing source take down the whole clinic", async () => {
    const throwing: Source = {
      name: "broken-source",
      sourceType: "clinic_website",
      discover: () => ["https://test.example"],
      extract: () => {
        throw new Error("cheerio selector exploded");
      },
    };
    const working = fakeSource("working-source", {
      email: [{ value: "info@test.example", sourceUrl: "https://test.example", sourceType: "clinic_website", confidence: 0.7, retrievedAt: "2026-09-04T00:00:00.000Z", extractionMethod: "test" }],
    });
    const result = await processClinic(clinic, { sources: [throwing, working], fetcher: fakeFetcher(true) });
    expect(result.processingErrors.length).toBe(1);
    expect(result.processingErrors[0]).toContain("cheerio selector exploded");
    expect(result.fields.email.value).toBe("info@test.example"); // the other source still ran
  });

  it("carries opening-hours evidence through to the resolved clinic", async () => {
    const source = fakeSource("hours-source", {
      openingHours: [
        {
          value: { byWeekday: { 1: [{ opens: "08:00", closes: "17:00" }] } },
          sourceUrl: "https://test.example",
          sourceType: "clinic_website",
          confidence: 0.65,
          evidenceText: "Måndag 08:00-17:00",
          retrievedAt: "2026-09-04T00:00:00.000Z",
          extractionMethod: "test:opening-hours",
        },
      ],
    });
    const result = await processClinic(clinic, { sources: [source], fetcher: fakeFetcher(true) });
    expect(result.fields.openingHours.value?.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(result.fields.openingHours.evidence[0]?.evidenceText).toBe("Måndag 08:00-17:00");
  });

  it("preserves conflicting opening-hours evidence from multiple sources", async () => {
    const first = fakeSource("first-hours-source", {
      openingHours: [{
        value: { byWeekday: { 1: [{ opens: "08:00", closes: "17:00" }] } },
        sourceUrl: "https://test.example/first",
        sourceType: "clinic_website",
        confidence: 0.65,
        evidenceText: "Måndag 08:00-17:00",
        retrievedAt: "2026-09-04T00:00:00.000Z",
        extractionMethod: "test:first-hours",
      }],
    }, ["https://test.example/first"]);
    const second = fakeSource("second-hours-source", {
      openingHours: [{
        value: { byWeekday: { 1: [{ opens: "09:00", closes: "18:00" }] } },
        sourceUrl: "https://test.example/second",
        sourceType: "national_health_portal",
        confidence: 0.85,
        evidenceText: "Måndag 09:00-18:00",
        retrievedAt: "2026-09-04T00:00:00.000Z",
        extractionMethod: "test:second-hours",
      }],
    }, ["https://test.example/second"]);
    const result = await processClinic(clinic, { sources: [first, second], fetcher: fakeFetcher(true) });
    expect(result.fields.openingHours.conflict).toBe(true);
    expect(result.fields.openingHours.evidence).toHaveLength(2);
    expect(result.fields.openingHours.value?.byWeekday[1]).toEqual([{ opens: "09:00", closes: "18:00" }]);
  });

  it("tries the next candidate URL from a source after the first one fails", async () => {
    let callIndex = 0;
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
      callIndex++;
      if (u.includes("/first")) return new Response("nope", { status: 404 });
      return new Response("<html>ok</html>", { status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 });

    const source: Source = {
      name: "multi-candidate",
      sourceType: "national_health_portal",
      discover: () => ["https://test.example/first", "https://test.example/second"],
      extract: () => ({
        canonicalName: [{ value: "Found It", sourceUrl: "https://test.example/second", sourceType: "national_health_portal", confidence: 0.6, retrievedAt: "2026-09-04T00:00:00.000Z", extractionMethod: "test" }],
      }),
    };

    const result = await processClinic(clinic, { sources: [source], fetcher });
    expect(result.fields.canonicalName.value).toBe("Found It");
    expect(result.sourcesSkipped.length).toBe(1); // the failed /first attempt
    expect(callIndex).toBe(2);
  });
});

describe("processClinics", () => {
  it("processes every clinic and calls onClinicDone for each", async () => {
    const clinics = [clinic, { ...clinic, id: "clinic-2", name: "Second Clinic" }];
    const source = fakeSource("test-source", {});
    const progress: number[] = [];
    const results = await processClinics(clinics, {
      sources: [source],
      fetcher: fakeFetcher(true),
      onClinicDone: (_c, i) => progress.push(i),
    });
    expect(results.length).toBe(2);
    expect(progress).toEqual([0, 1]);
  });

  it("continues past one bad clinic and still processes the rest", async () => {
    const badClinic: SeedClinic = { ...clinic, id: "bad", website: "not-a-valid-url" };
    const goodClinic: SeedClinic = { ...clinic, id: "good" };
    const source = fakeSource("test-source", {});
    const results = await processClinics([badClinic, goodClinic], { sources: [source], fetcher: fakeFetcher(true) });
    expect(results.length).toBe(2);
  });

  it("limits concurrent clinics while returning results in input order", async () => {
    let active = 0;
    let peak = 0;
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const clinics = Array.from({ length: 4 }, (_, index) => ({ ...clinic, id: `clinic-${index}`, name: `Clinic ${index}` }));
    const results = await processClinics(clinics, {
      sources: [fakeSource("test-source", {})],
      fetcher: new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 }),
      maxConcurrentClinics: 2,
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.seed.id)).toEqual(clinics.map((item) => item.id));
  });
});