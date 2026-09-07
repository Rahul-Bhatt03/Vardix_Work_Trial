import { describe, expect, it } from "vitest";
import { extractOrgNoCandidates, isNormalizedOrgNo } from "../../src/extract/orgno.js";

describe("extractOrgNoCandidates", () => {
  it("extracts a hyphenated org number and confirms Luhn validity", () => {
    // 556680-6351 is a real-shaped org number seen in the seed data.
    const c = extractOrgNoCandidates("Org.nr 556680-6351, Bjuvs Tandvårdsteam AB");
    const match = c.find((x) => x.normalized === "556680-6351");
    expect(match).toBeDefined();
    expect(match?.luhnValid).toBe(true);
  });

  it("flags a Luhn-invalid candidate rather than silently accepting it", () => {
    const c = extractOrgNoCandidates("Org.nr 556680-6352");
    const match = c.find((x) => x.normalized === "556680-6352");
    expect(match?.luhnValid).toBe(false);
  });

  it("normalizes a spaced org number to hyphenated form", () => {
    const c = extractOrgNoCandidates("Organisationsnummer: 556711 0621");
    expect(c.map((x) => x.normalized)).toContain("556711-0621");
  });

  it("does not choke on a postal-code-adjacent number sequence", () => {
    const c = extractOrgNoCandidates("111 22 Stockholm, telefon 08-123 45 67");
    // Should not crash; may or may not produce spurious 10-digit
    // candidates depending on spacing, which is why resolution weighs
    // Luhn validity and source type rather than trusting shape alone.
    expect(Array.isArray(c)).toBe(true);
  });
});

describe("isNormalizedOrgNo", () => {
  it("accepts the canonical shape", () => {
    expect(isNormalizedOrgNo("556680-6351")).toBe(true);
  });
  it("rejects a non-canonical shape", () => {
    expect(isNormalizedOrgNo("5566806351")).toBe(false);
    expect(isNormalizedOrgNo("556680 6351")).toBe(false);
  });
});