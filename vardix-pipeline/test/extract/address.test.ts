import { describe, expect, it } from "vitest";
import { extractAddressCandidates } from "../../src/extract/address.js";

describe("extractAddressCandidates", () => {
  it("extracts a street + postal code + city", () => {
    const c = extractAddressCandidates("Besök oss på Storgatan 12, 111 22 Stockholm för din tid.");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]?.postalCode).toBe("111 22");
    expect(c[0]?.city).toBe("Stockholm");
    expect(c[0]?.street).toContain("Storgatan 12");
  });

  it("extracts postal code + city even without a clean street line", () => {
    const c = extractAddressCandidates("Kliniken ligger i 412 63 Göteborg, nära centralstationen.");
    expect(c.length).toBeGreaterThan(0);
    expect(c[0]?.city).toBe("Göteborg");
    expect(c[0]?.street).toBeUndefined();
  });

  it("handles a house number with a letter suffix", () => {
    const c = extractAddressCandidates("Kungsgatan 5A, 252 21 Helsingborg");
    expect(c[0]?.street).toBe("Kungsgatan 5A");
  });

  it("does not crash on text with no address", () => {
    const c = extractAddressCandidates("Vi älskar tänder och friska leenden.");
    expect(c).toEqual([]);
  });
});