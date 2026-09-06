// Distinguishing an actual online-booking link from a generic "contact us" or social link is a text-matching problem over the link's href, its visible anchor text, and (weakly) its surrounding context. We score candidates rather than pattern-match a single regex, because the same domain (e.g. a booking-widget provider) can appear for many clinics while a false positive like a bare "facebook.com" link must never win.

export interface LinkCandidate {
  href: string;
  anchorText: string;
}

export interface BookingCandidate {
  url: string;
  anchorText: string;
  score: number; // higher = more likely a real booking link
  reason: string;
}

// These are known booking-provider domains ,that is a strong indication that it is a booking link
const BOOKING_DOMAINS = [
  "bokadirekt.se",
  "boka.se",
  "frenda.se",
  "opusdentalonline.com",
  "vardplanering",
  "timma.se",
  "bokning",
  "boking.se",
  "mybusinesspage.io",
  "clinicoffice",
  "dentala.se/boka",
];

// These are words that indicate booking
const BOOKING_WORDS = ["boka", "book", "appointment", "schedule", "tidsbokning", "boka tid", "boka online", "boka besök", "boka besok"];

// This prevents obvious false positives.
const REJECT_DOMAINS = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "tiktok.com"];

// Those are useful links, but they are not online booking URLs.
const REJECT_SCHEMES = ["tel:", "mailto:"];

// These are normal navigation links.They are unlikely to be booking links.
const GENERIC_WORDS = ["kontakt", "contact", "om oss", "hem", "start", "hitta hit"];

export function scoreBookingCandidate(link: LinkCandidate): BookingCandidate | null {
  const href = link.href.trim();
  const anchor = link.anchorText.trim().toLowerCase();

  if (REJECT_SCHEMES.some((s) => href.toLowerCase().startsWith(s))) return null;
  if (href.toLowerCase().startsWith("javascript:")) return null;

  let host = "";
  try {
    host = new URL(href, "https://placeholder.invalid").host.toLowerCase();
  } catch {
    return null;
  }

  if (REJECT_DOMAINS.some((d) => host.includes(d))) return null;

  let score = 0;
  const reasons: string[] = [];

  if (BOOKING_DOMAINS.some((d) => href.toLowerCase().includes(d))) {
    score += 3;
    reasons.push("known booking-provider domain");
  }
  if (BOOKING_WORDS.some((w) => anchor.includes(w))) {
    score += 2;
    reasons.push("anchor text mentions booking");
  }
  if (BOOKING_WORDS.some((w) => href.toLowerCase().includes(w.replace(/\s/g, "")))) {
    score += 1;
    reasons.push("URL path mentions booking");
  }
  const path = (() => {
    try {
      return new URL(href, "https://placeholder.invalid").pathname.toLowerCase().replace(/\/+$/, "") || "/";
    } catch {
      return "";
    }
  })();
  if (["/", "/kontakt", "/contact", "/om-oss", "/about", "/services"].includes(path) && score < 3) return null;
  if (GENERIC_WORDS.some((w) => anchor.includes(w)) && score === 0) {
    score -= 2;
    reasons.push("anchor text looks generic/navigational");
  }

  if (score <= 0) return null;

  return { url: href, anchorText: link.anchorText, score, reason: reasons.join("; ") };
}

/** Ranks candidates and returns the best, if any clears a minimum confidence bar. */
export function pickBestBookingLink(links: LinkCandidate[]): BookingCandidate | null {
  const scored = links.map(scoreBookingCandidate).filter((c): c is BookingCandidate => c !== null);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 2 ? best : null;
}