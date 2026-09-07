import type { OpeningHoursInterval, OpeningHoursValue } from "../model/types.js";

// Swedish opening hours show up in at least these shapes on real clinic
// sites (see test/fixtures/html for captured real-world examples):
//
//   Mån-Fre: 08:00-17:00
//   Måndag–torsdag 8.00-17.00, fredag 8.00-15.00
//   Mån, Ons, Fre 09:00-12:00 och 13:00-18:00   (split by lunch)
//   Tisdag stängt
//   Lunchstängt 12:00-13:00
//   Vardagar 08-17
//
// This parser is deliberately a best-effort structural parser, not a full
// natural-language understander. It handles day-range expansion, day
// lists, multiple intervals per day (lunch splits), "stängt", and the
// "vardagar" (weekdays) shorthand. Anything it cannot confidently place
// into the structured shape is kept verbatim in `notes` rather than
// dropped — see DECISIONS.md on why we prefer an honest partial parse
// over a confident wrong one.

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_NAMES: Record<string, Weekday> = {
  måndag: 1,
  mån: 1,
  monday: 1,
  mon: 1,
  mo: 1,
  tisdag: 2,
  tis: 2,
  tuesday: 2,
  tue: 2,
  tu: 2,
  onsdag: 3,
  ons: 3,
  wednesday: 3,
  wed: 3,
  we: 3,
  torsdag: 4,
  tor: 4,
  tors: 4,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  th: 4,
  fredag: 5,
  fre: 5,
  friday: 5,
  fri: 5,
  fr: 5,
  lördag: 6,
  lör: 6,
  saturday: 6,
  sat: 6,
  sa: 6,
  söndag: 7,
  sön: 7,
  sunday: 7,
  sun: 7,
  su: 7,
};

const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

function normalizeText(raw: string): string {
  return raw
    .replace(/[–—]/g, "-")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function parseTime(token: string): string | null {
  // Accepts "8", "08", "8.00", "08:00", "8:00"
  const m = token.match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseDayToken(token: string): Weekday[] | null {
  const t = token.toLowerCase().trim().replace(/\.$/, "");
  if (t === "vardagar" || t === "vardag") return [1, 2, 3, 4, 5];
  if (t === "helg" || t === "helger") return [6, 7];
  if (DAY_NAMES[t]) return [DAY_NAMES[t]];
  return null;
}

/** Expands "mån-fre" or "måndag till torsdag" into the inclusive weekday range. */
function parseDayRange(token: string): Weekday[] | null {
  const parts = token.toLowerCase().split(/\s*(?:-|till)\s*/);
  if (parts.length !== 2) return null;
  const startDay = DAY_NAMES[parts[0]?.trim() ?? ""];
  const endDay = DAY_NAMES[parts[1]?.trim() ?? ""];
  if (!startDay || !endDay) return null;
  const startIdx = WEEKDAY_ORDER.indexOf(startDay);
  const endIdx = WEEKDAY_ORDER.indexOf(endDay);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  return WEEKDAY_ORDER.slice(startIdx, endIdx + 1);
}

/** Parses a day-spec that may be a range, a comma list, or a single day/shorthand. */
function parseDaySpec(spec: string): Weekday[] | null {
  const range = parseDayRange(spec);
  if (range) return range;

  const items = spec
    .split(/\s*(?:,|och|&)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  const days = new Set<Weekday>();
  for (const item of items) {
    const r = parseDayRange(item);
    if (r) {
      r.forEach((d) => days.add(d));
      continue;
    }
    const single = parseDayToken(item);
    if (!single) return null;
    single.forEach((d) => days.add(d));
  }
  return days.size > 0 ? Array.from(days).sort((a, b) => a - b) : null;
}

/** Parses a time-spec that may hold one or more "HH:MM-HH:MM" intervals joined by "och"/",". */
function parseTimeSpec(spec: string): OpeningHoursInterval[] | null {
  const parts = spec
    .split(/\s*(?:och|,)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const intervals: OpeningHoursInterval[] = [];
  for (const part of parts) {
    const m = part.match(/^(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)$/);
    if (!m) return null;
    const opens = parseTime(m[1] ?? "");
    const closes = parseTime(m[2] ?? "");
    if (!opens || !closes) return null;
    intervals.push({ opens, closes });
  }
  return intervals.length > 0 ? intervals : null;
}

const CLOSED_WORDS = ["stängt", "stängd", "closed"];

/**
 * One line/segment of an opening-hours block, e.g.
 * "Mån-Fre: 08:00-17:00" or "Lördag stängt". Splits on the first colon if
 * present, otherwise looks for a trailing time-or-closed pattern.
 */
// Marks where the "rest" of a segment (the time-or-closed part) begins:
// either a closed-word, or something that looks like the start of a time
// (a 1-2 digit number, optionally followed by :MM or .MM). Splitting on
// this instead of the first whitespace is what lets a comma-separated day
// list ("Mån, Ons, Fre 09:00-18:00") stay intact as the day part.
const REST_START_PATTERN = new RegExp(`(?:${CLOSED_WORDS.join("|")}|\\d{1,2}(?:[.:]\\d{2})?\\s*-)`, "i");

const DAY_WORD_PATTERN = Object.keys(DAY_NAMES)
  .sort((a, b) => b.length - a.length)
  .map((day) => day.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const NEXT_SEGMENT_PATTERN = new RegExp(
  `(\\d{1,2}(?:[.:]\\d{2})?\\s*-\\s*\\d{1,2}(?:[.:]\\d{2})?|${CLOSED_WORDS.join("|")})\\s*(?=(?:${DAY_WORD_PATTERN})(?:\\b|\\s|:))`,
  "gi",
);

function splitCompactSegments(text: string): string[] {
  return text
    .replace(NEXT_SEGMENT_PATTERN, "$1\n")
    .split(/\n|\||;/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseSegment(segment: string): { days: Weekday[]; intervals: OpeningHoursInterval[] | "closed" } | null {
  const s = segment.trim();
  if (!s) return null;

  const restMatch = s.match(REST_START_PATTERN);
  if (!restMatch || restMatch.index === undefined) return null;

  const dayPart = s.slice(0, restMatch.index).replace(/:\s*$/, "").trim();
  const restPart = s.slice(restMatch.index).trim();
  if (!dayPart) return null;

  const days = parseDaySpec(dayPart);
  if (!days) return null;

  const lowerRest = restPart.toLowerCase();
  if (CLOSED_WORDS.some((w) => lowerRest.includes(w))) {
    return { days, intervals: "closed" };
  }

  const intervals = parseTimeSpec(restPart) ?? parseLeadingTimeSpec(restPart);
  if (!intervals) return null;
  return { days, intervals };
}

function parseLeadingTimeSpec(spec: string): OpeningHoursInterval[] | null {
  const time = `(\\d{1,2}(?:[.:]\\d{2})?)\\s*-\\s*(\\d{1,2}(?:[.:]\\d{2})?)`;
  const match = spec.match(new RegExp(`^${time}(?:\\s*(?:och|,)\\s*${time})*`, "i"));
  return match?.[0] ? parseTimeSpec(match[0]) : null;
}

export interface HoursParseResult {
  value: OpeningHoursValue;
  /** True if at least one segment could not be structurally parsed and was kept only as a note. */
  hadUnparsedSegments: boolean;
  /** Compact source text suitable for evidence when hours came from structured data. */
  evidenceText?: string;
}

/**
 * Parses a raw opening-hours block (as extracted from a page, one or more
 * lines/sentences) into the structured weekly shape. Segments that cannot
 * be parsed are preserved verbatim in `notes` rather than silently
 * dropped.
 */
export function parseOpeningHours(rawBlock: string): HoursParseResult {
  const text = normalizeText(rawBlock);
  // Split on line breaks, and on ". " boundaries that look like new
  // day-segments (capital day name follows), since some sites put
  // everything in one paragraph.
  const segments = splitCompactSegments(text);

  const byWeekday: OpeningHoursValue["byWeekday"] = {};
  const unparsed: string[] = [];

  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (!parsed) {
      unparsed.push(segment);
      continue;
    }
    for (const day of parsed.days) {
      byWeekday[day] = parsed.intervals === "closed" ? [] : parsed.intervals;
    }
  }

  return {
    value: {
      byWeekday,
      notes: unparsed.length > 0 ? unparsed.join(" | ") : undefined,
    },
    hadUnparsedSegments: unparsed.length > 0,
  };
}

function structuredDay(value: unknown): Weekday | null {
  if (typeof value !== "string") return null;
  const token = value.toLowerCase().split(/[\/#]/).pop()?.replace(/[^a-zåäö]/g, "") ?? "";
  return DAY_NAMES[token] ?? null;
}

function structuredTime(value: unknown): string | null {
  return typeof value === "string" ? parseTime(value.trim()) : null;
}

/** Parses schema.org opening-hours fields from JSON-LD objects. */
export function parseStructuredOpeningHours(objects: Record<string, unknown>[]): HoursParseResult | null {
  const byWeekday: OpeningHoursValue["byWeekday"] = {};
  const evidenceLines: string[] = [];
  let sawStructuredHours = false;

  for (const object of objects) {
    const specifications = object.openingHoursSpecification;
    const specificationValues = Array.isArray(specifications) ? specifications : specifications ? [specifications] : [];
    if (specificationValues.length > 0) {
      for (const specification of specificationValues) {
        if (!specification || typeof specification !== "object") continue;
        const item = specification as Record<string, unknown>;
        const days = Array.isArray(item.dayOfWeek) ? item.dayOfWeek : [item.dayOfWeek];
        const weekdays = days.map(structuredDay).filter((day): day is Weekday => day !== null);
        const opens = structuredTime(item.opens);
        const closes = structuredTime(item.closes);
        if (weekdays.length === 0 || !opens || !closes) continue;
        sawStructuredHours = true;
        for (const day of weekdays) byWeekday[day] = [{ opens, closes }];
        evidenceLines.push(`${weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ")} ${opens}-${closes}`);
      }
    }

    const openingHours = object.openingHours;
    const values = typeof openingHours === "string" ? [openingHours] : Array.isArray(openingHours) ? openingHours : [];
    const textValues = values.filter((value): value is string => typeof value === "string");
    if (textValues.length > 0) {
      const parsed = parseOpeningHours(textValues.join("\n"));
      if (Object.keys(parsed.value.byWeekday).length > 0) {
        sawStructuredHours = true;
        for (const [day, intervals] of Object.entries(parsed.value.byWeekday)) {
          byWeekday[Number(day) as Weekday] = intervals;
        }
        evidenceLines.push(...textValues);
      }
    }
  }

  if (!sawStructuredHours) return null;
  return { value: { byWeekday, notes: undefined }, hadUnparsedSegments: false, evidenceText: evidenceLines.join("\n") };
}