import * as cheerio from "cheerio";
import type { SeedClinic } from "../model/types.js";
import type { FetchOutcome, RawEvidence, Source } from "./types.js";
import { extractPhoneCandidates } from "../extract/phone.js";
import { extractAddressCandidates } from "../extract/address.js";
import { extractOrgNoCandidates } from "../extract/orgno.js";
import { parseOpeningHours } from "../extract/hours.js";
import { matchServices } from "../extract/services.js";
import { detectDentalSubsidyMentions } from "../extract/subsidy.js";
import { pickBestBookingLink, type LinkCandidate } from "../extract/booking.js";

// The clinic's own website is the one source every seed row has, so it
// carries the most coverage but the least structure — no two clinic sites
// use the same template. This source deliberately does NOT try to
// out-guess every possible page layout. It:
//   1. reads the homepage text as a whole for phone/address/hours/services/subsidy
//   2. separately looks for an "öppettider" heading to get a tighter hours
//      block when the page has one, since homepage-wide text can
//      accidentally concatenate unrelated numbers into a bad hours parse
//   3. scores every link on the page for booking likelihood
//
// Confidence is deliberately lower than a registry source for the same
// field, since there is no independent verification that page text
// wasn't marketing copy, a stale note, or a template default the clinic
// never edited. See DECISIONS.md for the confidence model.

function findHoursHeadingBlock($: cheerio.CheerioAPI): string | null {
  const HEADING_WORDS = ["öppettider", "öppetider", "oppettider"];
  const heading = $("h1,h2,h3,h4,strong,b")
    .filter((_, el) => HEADING_WORDS.some((w) => $(el).text().trim().toLowerCase().includes(w)))
    .first();
  if (heading.length === 0) return null;

  const tag = (heading.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase();
  const isHeadingTag = tag && /^h[1-4]$/.test(tag);
  const collected: string[] = [];

  if (isHeadingTag) {
    let el = heading.next();
    let steps = 0;
    while (el.length > 0 && steps < 10 && !/^h[1-4]$/.test((el.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? "")) {
      collected.push($(el).text().trim());
      el = el.next();
      steps++;
    }
  } else {
    // Heading word was inline (e.g. inside a <strong>); fall back to the
    // parent element's text, which usually holds the whole hours block on
    // small sites.
    collected.push(heading.parent().text().trim());
  }

  const text = collected.filter(Boolean).join("\n");
  return text || null;
}

function jsonLdObjects($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text()) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) if (value && typeof value === "object") objects.push(value as Record<string, unknown>);
    } catch {
      // Ignore malformed third-party JSON-LD.
    }
  });
  return objects;
}

function structuredName($: cheerio.CheerioAPI): { value: string; method: string } | null {
  for (const object of jsonLdObjects($)) {
    const type = object["@type"];
    if (typeof object.name === "string" && (type === "Organization" || type === "LocalBusiness" || type === "Dentist" || type === "MedicalBusiness")) {
      return { value: object.name.trim(), method: "json-ld:organization-name" };
    }
  }
  const siteName = $("meta[property='og:site_name'], meta[name='application-name']").first().attr("content")?.trim();
  return siteName ? { value: siteName, method: "meta:site-name" } : null;
}

function structuredAddress($: cheerio.CheerioAPI): string | null {
  for (const object of jsonLdObjects($)) {
    const address = object.address;
    if (address && typeof address === "object") {
      const value = address as Record<string, unknown>;
      const line = [value.streetAddress, value.postalCode, value.addressLocality]
        .filter((part): part is string => typeof part === "string")
        .join(", ");
      if (line) return line;
    }
  }
  return $("address").first().text().replace(/\s+/g, " ").trim() || null;
}

export class WebsiteSource implements Source {
  readonly name = "clinic_website";
  readonly sourceType = "clinic_website" as const;

  discover(clinic: SeedClinic): string[] {
    const base = clinic.website.replace(/\/+$/, "");
    const paths = ["/kontakt", "/om-oss", "/oppettider", "/boka"];
    return [clinic.website, ...paths.map((path) => `${base}${path}`)];
  }

  extract(clinic: SeedClinic, fetched: Extract<FetchOutcome, { ok: true }>): RawEvidence {
    const $ = cheerio.load(fetched.body);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const now = new Date().toISOString();
    const evidence: RawEvidence = {};

    // --- Canonical name: structured provider data and page content beat SEO titles.
    const title = $("title").first().text().trim();
    const h1 = $("h1").first().text().trim();
    const structured = structuredName($);
    const nameGuess = structured?.value || h1 || title;
    if (nameGuess) {
      evidence.canonicalName = [
        {
          value: nameGuess,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: structured ? 0.85 : h1 ? 0.7 : 0.4,
          evidenceText: nameGuess,
          retrievedAt: now,
          extractionMethod: structured?.method ?? (h1 ? "dom:h1" : "dom:title"),
        },
      ];
    }

    // --- Phone
    const telHref = $('a[href^="tel:"]').first().attr("href");
    const phoneCandidates = extractPhoneCandidates(telHref ? telHref.replace("tel:", "") : bodyText);
    if (phoneCandidates.length > 0) {
      evidence.phone = [
        {
          value: phoneCandidates[0]!.normalized,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: telHref ? 0.75 : 0.5,
          evidenceText: phoneCandidates[0]!.raw,
          retrievedAt: now,
          extractionMethod: telHref ? "tel-link" : "regex:phone",
        },
      ];
    }

    // --- Email
    const mailHref = $('a[href^="mailto:"]').first().attr("href");
    const emailMatch = mailHref
      ? mailHref.replace("mailto:", "").split("?")[0]
      : bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
    if (emailMatch) {
      evidence.email = [
        {
          value: emailMatch,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: mailHref ? 0.8 : 0.55,
          evidenceText: emailMatch,
          retrievedAt: now,
          extractionMethod: mailHref ? "mailto-link" : "regex:email",
        },
      ];
    }

    // --- Address
    const addressCandidates = extractAddressCandidates(structuredAddress($) ?? bodyText);
    if (addressCandidates.length > 0) {
      evidence.visitingAddress = [
        {
          value: addressCandidates[0]!,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: addressCandidates[0]!.street ? 0.65 : 0.5,
          evidenceText: addressCandidates[0]!.raw,
          retrievedAt: now,
          extractionMethod: "regex:address",
        },
      ];
    }

    // --- Org number (some clinics print it in the footer)
    const orgCandidates = extractOrgNoCandidates(bodyText).filter((c) => c.luhnValid);
    if (orgCandidates.length > 0) {
      evidence.orgNumber = [
        {
          value: orgCandidates[0]!.normalized,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: 0.7, // Luhn-valid but shape alone can't distinguish org number from personnummer
          evidenceText: orgCandidates[0]!.raw,
          retrievedAt: now,
          extractionMethod: "regex:orgno+luhn",
        },
      ];
    }

    // --- Opening hours: prefer a dedicated "öppettider" block if we can find one.
    const hoursBlock = findHoursHeadingBlock($);
    if (hoursBlock) {
      const parsed = parseOpeningHours(hoursBlock);
      if (Object.keys(parsed.value.byWeekday).length > 0 || parsed.value.notes) {
        evidence.openingHours = [
          {
            value: parsed.value,
            sourceUrl: fetched.url,
            sourceType: this.sourceType,
            confidence: parsed.hadUnparsedSegments ? 0.45 : 0.65,
            evidenceText: hoursBlock.slice(0, 300),
            retrievedAt: now,
            extractionMethod: "dom:heading-block+parseOpeningHours",
          },
        ];
      }
    }

    // --- Services + subsidy from the full page text.
    const services = matchServices(bodyText, clinic.segment);
    if (services.length > 0) {
      evidence.services = [
        {
          value: services.map((s) => s.canonical),
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: 0.6,
          evidenceText: services.map((s) => s.evidenceText).join(" | "),
          retrievedAt: now,
          extractionMethod: "vocab:matchServices",
        },
      ];
    }

    const subsidyMatches = detectDentalSubsidyMentions(bodyText);
    if (subsidyMatches.length > 0) {
      evidence.dentalSubsidy = [
        {
          value: { status: subsidyMatches[0]!.status },
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: 0.6,
          evidenceText: subsidyMatches[0]!.matchedText,
          retrievedAt: now,
          extractionMethod: "regex:detectDentalSubsidyMentions",
        },
      ];
    }

    // --- Booking link
    const links: LinkCandidate[] = $("a[href]")
      .toArray()
      .map((el) => ({ href: $(el).attr("href") ?? "", anchorText: $(el).text().trim() }))
      .filter((l) => l.href);
    const best = pickBestBookingLink(links);
    if (best) {
      let resolvedUrl = best.url;
      try {
        resolvedUrl = new URL(best.url, fetched.url).toString();
      } catch {
        // leave as-is if it's already absolute or unresolvable
      }
      evidence.bookingUrl = [
        {
          value: resolvedUrl,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: Math.min(0.5 + best.score * 0.15, 0.9),
          evidenceText: `${best.anchorText} (${best.reason})`,
          retrievedAt: now,
          extractionMethod: "link-score:pickBestBookingLink",
        },
      ];
    }

    return evidence;
  }
}