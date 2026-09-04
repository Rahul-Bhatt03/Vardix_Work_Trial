import { describe, expect, it } from "vitest";
import { pickBestBookingLink, scoreBookingCandidate } from "../../src/extract/booking.js";

describe("scoreBookingCandidate", () => {
  it("accepts a known booking-provider domain", () => {
    const r = scoreBookingCandidate({ href: "https://www.bokadirekt.se/places/adental-123", anchorText: "Boka tid" });
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThanOrEqual(2);
  });

  it("rejects a Facebook link even if the surrounding page mentions booking", () => {
    const r = scoreBookingCandidate({ href: "https://facebook.com/adental", anchorText: "boka" });
    expect(r).toBeNull();
  });

  it("rejects a bare phone link", () => {
    const r = scoreBookingCandidate({ href: "tel:+46812345678", anchorText: "Ring oss" });
    expect(r).toBeNull();
  });

  it("rejects a generic contact link with no booking signal", () => {
    const r = scoreBookingCandidate({ href: "/kontakt", anchorText: "Kontakt" });
    expect(r).toBeNull();
  });

  it("rejects a bare homepage link with no booking words", () => {
    const r = scoreBookingCandidate({ href: "https://adental.se", anchorText: "Startsida" });
    expect(r).toBeNull();
  });
});

describe("pickBestBookingLink", () => {
  it("prefers the booking-domain link over a generic contact link on the same page", () => {
    const best = pickBestBookingLink([
      { href: "/kontakt", anchorText: "Kontakt" },
      { href: "https://www.bokadirekt.se/places/adental-123", anchorText: "Boka tid online" },
      { href: "https://facebook.com/adental", anchorText: "Följ oss" },
    ]);
    expect(best?.url).toContain("bokadirekt.se");
  });

  it("returns null when no candidate clears the confidence bar", () => {
    const best = pickBestBookingLink([
      { href: "/kontakt", anchorText: "Kontakt" },
      { href: "/om-oss", anchorText: "Om oss" },
    ]);
    expect(best).toBeNull();
  });
});