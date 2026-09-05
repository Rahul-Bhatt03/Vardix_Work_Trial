// This file is the 1177.se data source adapter. Its job is to find a clinic's 1177 page, verify that the page belongs to the correct clinic, and then extract useful fields from specific sections.

import * as cheerio from "cheerio";
import type { SeedClinic } from "../model/types.js";
import type { RawEvidence, Source } from "./types.js";
import type { FetchOutcome } from "./types.js";
import { extractPhoneCandidates } from "../extract/phone.js";
import { extractAddressCandidates } from "../extract/address.js";
import { parseOpeningHours } from "../extract/hours.js";
import { matchServices } from "../extract/services.js";
import { detectDentalSubsidyMentions } from "../extract/subsidy.js";

// 1177.se ("Hitta vård") publishes one page per registered care unit at a
// predictable URL: the unit's official name, title-cased-and-hyphenated,
// with Swedish diacritics transliterated. E.g. the official name "Bjuvs
// Tandvårdsteam AB" (Bjuv) becomes
//   /hitta-vard/kontaktkort/Bjuvs-Tandvardsteam-AB-Bjuv/
// This is a guessable pattern, not a documented API, so we treat a
// constructed URL as a CANDIDATE only. Because the seed CSV's `name`
// field may not exactly match 1177's registered spelling or word order,
// we verify the fetched page's own <h1> plausibly names the same clinic
// before accepting any evidence from it — otherwise we would risk
// silently attaching a different clinic's phone number or hours to this
// record, which is exactly the kind of unsupported claim the brief
// prohibits.

function transliterate(s: string): string {
  return s
    .replace(/å/gi, (c) => (c === "Å" ? "A" : "a"))
    .replace(/ä/gi, (c) => (c === "Ä" ? "A" : "a"))
    .replace(/ö/gi, (c) => (c === "Ö" ? "O" : "o"))
    .replace(/é/gi, (c) => (c === "É" ? "E" : "e"));
}

function toSlugWords(s: string): string[] {
  return transliterate(s)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function titleCase(word: string): string {
  if (word === word.toUpperCase() && word.length > 1) return word; // preserve acronyms like AB
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function guess1177UrlForName(clinic: SeedClinic, name: string): string {
  const nameWords = toSlugWords(name).map(titleCase);
  const citySlug = toSlugWords(clinic.city).map(titleCase);
  // Avoid duplicating the city if it's already the last word(s) of the name.
  const nameLower = nameWords.map((w) => w.toLowerCase());
  const cityLower = citySlug.map((w) => w.toLowerCase());
  const alreadyIncludesCity = cityLower.length > 0 && nameLower.slice(-cityLower.length).join("-") === cityLower.join("-");
  const words = alreadyIncludesCity ? nameWords : [...nameWords, ...citySlug];
  return `https://www.1177.se/hitta-vard/kontaktkort/${words.join("-")}/`;
}

export function guess1177Url(clinic: SeedClinic): string {
  return guess1177UrlForName(clinic, clinic.name);
}

/** Rough token-overlap similarity between the fetched page's own heading and the seed clinic's name+city. Not a fuzzy-match library — deliberately simple and auditable. */
function nameMatchesPage(clinic: SeedClinic, pageHeading: string): boolean {
  const seedTokens = new Set(toSlugWords(`${clinic.name} ${clinic.city}`).map((w) => w.toLowerCase()));
  const pageTokens = new Set(toSlugWords(pageHeading).map((w) => w.toLowerCase()));
  let overlap = 0;
  for (const t of pageTokens) if (seedTokens.has(t)) overlap++;
  // Require at least half of the page heading's meaningful tokens to
  // appear in the seed name+city, and at least 2 overlapping tokens so a
  // single common word ("Tandvård") can't pass alone.
  return pageTokens.size > 0 && overlap >= 2 && overlap / pageTokens.size >= 0.5;
}

/** Finds the text of the first heading (h1/h2/h3) whose text matches `label`, then returns the text of the sibling elements up to (not including) the next heading of equal-or-higher level. */
function sectionAfterHeading($: cheerio.CheerioAPI, label: string): cheerio.Cheerio<any> {
  const heading = $("h1,h2,h3")
    .filter((_, el) => $(el).text().trim().toLowerCase() === label.toLowerCase())
    .first();
  if (heading.length === 0) return $();
  const tagName = (heading.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase();
  const stopTags = tagName === "h2" ? ["h1", "h2"] : ["h1", "h2", "h3"];
  const collected: any[] = [];
  let el = heading.next();
  while (el.length > 0 && !stopTags.includes((el.get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? "")) {
    collected.push(el.get(0));
    el = el.next();
  }
  return $(collected);
}

export class Registry1177Source implements Source {
  readonly name = "1177.se";
  readonly sourceType = "national_health_portal" as const;

  discover(clinic: SeedClinic): string[] {
    const names = [
      clinic.name,
      clinic.name.replace(/\s*-\s*(?:tdl|tandläkare|dr\.?|doktor)\b.*$/i, ""),
      clinic.name.replace(/\s+AB$/i, ""),
    ];
    return [...new Set(names.map((name) => guess1177UrlForName(clinic, name)))];
  }

  extract(clinic: SeedClinic, fetched: Extract<FetchOutcome, { ok: true }>): RawEvidence {
    const $ = cheerio.load(fetched.body);
    const heading = $("h1").first().text().trim();

    if (!nameMatchesPage(clinic, heading)) {
      // Wrong page (guessed URL did not resolve to this clinic, or the
      // clinic is not on 1177 under this name). Report no evidence rather
      // than guessing which clinic we actually landed on.
      return {};
    }

    const evidence: RawEvidence = {};
    const now = new Date().toISOString();

    // Canonical name: the page's own <h1> is 1177's registered name for
    // this care unit, and we have already verified above that it plausibly
    // names this clinic — so it is meaningfully better evidence than the
    // website source's <title>/<h1> guess (which has no such check).
    evidence.canonicalName = [
      {
        value: heading,
        sourceUrl: fetched.url,
        sourceType: this.sourceType,
        confidence: 0.75,
        evidenceText: heading,
        retrievedAt: now,
        extractionMethod: "dom:h1+name-match-verified",
      },
    ];

    // Phone: prefer an explicit tel: link, which is unambiguous.
    const telHref = $('a[href^="tel:"]').first().attr("href");
    const phoneText = $("body").text();
    const phoneCandidates = extractPhoneCandidates(telHref ? telHref.replace("tel:", "") : phoneText);
    if (phoneCandidates.length > 0) {
      evidence.phone = [
        {
          value: phoneCandidates[0]!.normalized,
          sourceUrl: fetched.url,
          sourceType: this.sourceType,
          confidence: telHref ? 0.9 : 0.6,
          evidenceText: phoneCandidates[0]!.raw,
          retrievedAt: now,
          extractionMethod: telHref ? "tel-link" : "regex:phone",
        },
      ];
    }

    // Opening hours: the "Öppettider" section specifically, not "Telefontider".
    const hoursSection = sectionAfterHeading($, "Öppettider");
    if (hoursSection.length > 0) {
      const hoursText = hoursSection
        .find("tr")
        .toArray()
        .map((tr) => {
          const cells = $(tr)
            .find("td")
            .toArray()
            .map((td) => $(td).text().trim());
          return cells.length >= 2 ? `${cells[0]} ${cells[1]}` : "";
        })
        .filter(Boolean)
        .join("\n");
      if (hoursText) {
        const parsed = parseOpeningHours(hoursText);
        evidence.openingHours = [
          {
            value: parsed.value,
            sourceUrl: fetched.url,
            sourceType: this.sourceType,
            confidence: parsed.hadUnparsedSegments ? 0.6 : 0.85,
            evidenceText: hoursText,
            retrievedAt: now,
            extractionMethod: "dom-section:Öppettider+parseOpeningHours",
          },
        ];
      }
    }

    // Address: the "Hitta oss" definition list.
    const findUsSection = sectionAfterHeading($, "Hitta oss");
    const addressLabelText = findUsSection.text();
    const addressMatch = addressLabelText.match(/Besöksadress:\s*([^\n]+)/);
    if (addressMatch) {
      const candidates = extractAddressCandidates(addressLabelText);
      if (candidates.length > 0) {
        evidence.visitingAddress = [
          {
            value: candidates[0]!,
            sourceUrl: fetched.url,
            sourceType: this.sourceType,
            confidence: 0.85,
            evidenceText: addressMatch[0],
            retrievedAt: now,
            extractionMethod: "dom-section:Hitta oss+extractAddressCandidates",
          },
        ];
      }
    }

    // Services + subsidy: the "Om oss" free text.
    const aboutSection = sectionAfterHeading($, "Om oss");
    const aboutText = aboutSection.text().trim();
    if (aboutText) {
      const services = matchServices(aboutText, clinic.segment);
      if (services.length > 0) {
        evidence.services = [
          {
            value: services.map((s) => s.canonical),
            sourceUrl: fetched.url,
            sourceType: this.sourceType,
            confidence: 0.7,
            evidenceText: services.map((s) => s.evidenceText).join(" | "),
            retrievedAt: now,
            extractionMethod: "dom-section:Om oss+matchServices",
          },
        ];
      }
      const subsidyMatches = detectDentalSubsidyMentions(aboutText);
      if (subsidyMatches.length > 0) {
        const status = subsidyMatches[0]!.status;
        evidence.dentalSubsidy = [
          {
            value: { status },
            sourceUrl: fetched.url,
            sourceType: this.sourceType,
            confidence: 0.8,
            evidenceText: subsidyMatches[0]!.matchedText,
            retrievedAt: now,
            extractionMethod: "dom-section:Om oss+detectDentalSubsidyMentions",
          },
        ];
      }
    }

    return evidence;
  }
}