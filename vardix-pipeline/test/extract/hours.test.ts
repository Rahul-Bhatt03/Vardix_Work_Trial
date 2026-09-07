import { describe, expect, it } from "vitest";
import { parseOpeningHours, parseStructuredOpeningHours } from "../../src/extract/hours.js";

describe("parseOpeningHours", () => {
  it("parses a simple day-range with colon", () => {
    const r = parseOpeningHours("Mån-Fre: 08:00-17:00");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[5]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[6]).toBeUndefined();
    expect(r.hadUnparsedSegments).toBe(false);
  });

  it("parses different hours per day-group on separate lines", () => {
    const r = parseOpeningHours("Måndag-torsdag 8.00-17.00\nFredag 8.00-15.00");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[4]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[5]).toEqual([{ opens: "08:00", closes: "15:00" }]);
  });

  it("parses a lunch-split day into two intervals", () => {
    const r = parseOpeningHours("Mån 09:00-12:00 och 13:00-18:00");
    expect(r.value.byWeekday[1]).toEqual([
      { opens: "09:00", closes: "12:00" },
      { opens: "13:00", closes: "18:00" },
    ]);
  });

  it("records a closed day as an empty interval list, distinct from unknown", () => {
    const r = parseOpeningHours("Lördag stängt");
    expect(r.value.byWeekday[6]).toEqual([]);
    expect(r.value.byWeekday[1]).toBeUndefined(); // Monday: unmentioned, stays unknown
  });

  it("expands the vardagar shorthand to Monday-Friday", () => {
    const r = parseOpeningHours("Vardagar 08-17");
    for (const day of [1, 2, 3, 4, 5] as const) {
      expect(r.value.byWeekday[day]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    }
    expect(r.value.byWeekday[6]).toBeUndefined();
  });

  it("handles a comma-separated day list with one shared time", () => {
    const r = parseOpeningHours("Mån, Ons, Fre 09:00-18:00");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "09:00", closes: "18:00" }]);
    expect(r.value.byWeekday[3]).toEqual([{ opens: "09:00", closes: "18:00" }]);
    expect(r.value.byWeekday[5]).toEqual([{ opens: "09:00", closes: "18:00" }]);
    expect(r.value.byWeekday[2]).toBeUndefined();
  });

  it("keeps an unparseable segment as a note instead of dropping it", () => {
    const r = parseOpeningHours("Öppettider enligt överenskommelse, ring för tid");
    expect(r.hadUnparsedSegments).toBe(true);
    expect(r.value.notes).toContain("överenskommelse");
    expect(Object.keys(r.value.byWeekday).length).toBe(0);
  });

  it("parses a full week block with a mix of formats, real-world shaped", () => {
    const block = "Mån-Tors: 08:00-17:00\nFre: 08:00-15:00\nLör-Sön: stängt";
    const r = parseOpeningHours(block);
    expect(r.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[4]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[5]).toEqual([{ opens: "08:00", closes: "15:00" }]);
    expect(r.value.byWeekday[6]).toEqual([]);
    expect(r.value.byWeekday[7]).toEqual([]);
    expect(r.hadUnparsedSegments).toBe(false);
  });

  it("parses compact adjacent weekday segments from rendered text", () => {
    const r = parseOpeningHours("Måndag - Fredag: 08:00-18:00Lördag: 10:00-16:00Söndag: Stängt");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "18:00" }]);
    expect(r.value.byWeekday[6]).toEqual([{ opens: "10:00", closes: "16:00" }]);
    expect(r.value.byWeekday[7]).toEqual([]);
  });

  it("parses compact abbreviated Swedish segments with trailing prose", () => {
    const r = parseOpeningHours("Mån – Tors : 9 – 17Fre : 9 – 15");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "09:00", closes: "17:00" }]);
    expect(r.value.byWeekday[4]).toEqual([{ opens: "09:00", closes: "17:00" }]);
    expect(r.value.byWeekday[5]).toEqual([{ opens: "09:00", closes: "15:00" }]);
  });

  it("parses English weekday abbreviations used by schema.org openingHours", () => {
    const r = parseOpeningHours("Mo-Fr 08:00-17:00\nSa-Su closed");
    expect(r.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r.value.byWeekday[6]).toEqual([]);
    expect(r.value.byWeekday[7]).toEqual([]);
  });

  it("parses schema.org openingHours strings", () => {
    const r = parseStructuredOpeningHours([{ openingHours: ["Mo-Fr 09:00-17:00", "Sa 10:00-13:00"] }]);
    expect(r?.value.byWeekday[1]).toEqual([{ opens: "09:00", closes: "17:00" }]);
    expect(r?.value.byWeekday[6]).toEqual([{ opens: "10:00", closes: "13:00" }]);
    expect(r?.evidenceText).toContain("Mo-Fr");
  });

  it("parses schema.org openingHoursSpecification", () => {
    const r = parseStructuredOpeningHours([
      {
        openingHoursSpecification: [
          { dayOfWeek: ["https://schema.org/Monday", "https://schema.org/Tuesday"], opens: "08:00", closes: "17:00" },
          { dayOfWeek: "https://schema.org/Friday", opens: "08.00", closes: "15.00" },
        ],
      },
    ]);
    expect(r?.value.byWeekday[1]).toEqual([{ opens: "08:00", closes: "17:00" }]);
    expect(r?.value.byWeekday[5]).toEqual([{ opens: "08:00", closes: "15:00" }]);
  });

  it("returns null for missing or unusable structured hours", () => {
    expect(parseStructuredOpeningHours([{}])).toBeNull();
    expect(parseStructuredOpeningHours([{ openingHours: ["Call for opening hours"] }])).toBeNull();
  });

  it("keeps malformed hours as notes without inventing a schedule", () => {
    const r = parseOpeningHours("Måndag öppet när det passar");
    expect(Object.keys(r.value.byWeekday)).toHaveLength(0);
    expect(r.value.notes).toContain("öppet när det passar");
  });
});