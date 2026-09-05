//Where a piece of evidence came from, in terms of source category.
export type SourceType =
    | "clinic_website"
    | "registry" // e.g. allabolag.se, Bolagsverket-derived data
    | "care_provider_registry" // e.g. e-register.ivo.se
    | "national_health_portal" // 1177.se
    | "map_listing"
    | "other";

//   The fields the pipeline resolves for every clinic.
export type FieldName =
    | "canonicalName"
    | "orgNumber"
    | "visitingAddress"
    | "phone"
    | "email"
    | "openingHours"
    | "services"
    | "dentalSubsidy"
    | "bookingUrl";


// Special value for the dental-subsidy field, which is not a plain boolean
export type DentalSubsidyStatus =
    | "confirmed"
    | "not_found"
    | "conflicting"
    | "unknown";

export interface DentalSubsidyValue {
    status: DentalSubsidyStatus;
}


export interface OpeningHoursInterval {
    opens: string; // "HH:MM", 24h
    closes: string; // "HH:MM", 24h
}


export interface OpeningHoursValue {
    // Empty array means closed that day. Absent key means unknown for that day.
    byWeekday: Partial<
        Record<1 | 2 | 3 | 4 | 5 | 6 | 7, OpeningHoursInterval[]>
    >;
    // Free-text notes the normalizer could not fit into the structured shape, e.g. "closed for lunch varies by season".
    notes?: string;
}

export interface AddressValue {
    street?: string;
    postalCode?: string;
    city?: string;
    raw: string;
}

//  One observation of a field value from one source. Raw, not yet resolved against other evidence for the same field. Many of these can exist for one field on one clinic.
export interface FieldEvidence<T> {
    value: T | null;
    sourceUrl: string;
    sourceType: SourceType;
    confidence: number;
    evidenceText?: string;
    retrievedAt: string;
    /** How the value was pulled out: which extractor, deterministic or LLM. */
    extractionMethod: string;
}

//A field value after merging all evidence for it across sources: the chosen value, why it was chosen, and whether sources disagreed.
export interface ResolvedField<T> {
  value: T | null;
  confidence: number;
  /** True when two or more sources gave materially different values. */
  conflict: boolean;
  conflictCategory?: "representation_difference" | "source_disagreement" | "identity_mismatch" | "extraction_error" | "stale_source";
  /** Human-readable explanation of how the value was chosen. Required when conflict is true. */
  resolutionNote?: string;
  evidence: FieldEvidence<T>[];
}

export interface ResolvedClinicFields {
  canonicalName: ResolvedField<string>;
  orgNumber: ResolvedField<string>;
  visitingAddress: ResolvedField<AddressValue>;
  phone: ResolvedField<string>;
  email: ResolvedField<string>;
  openingHours: ResolvedField<OpeningHoursValue>;
  services: ResolvedField<string[]>;
  dentalSubsidy: ResolvedField<DentalSubsidyValue>;
  bookingUrl: ResolvedField<string>;
}

export interface SeedClinic {
  id: string; // stable id derived from the row (slug of name+city)
  name: string;
  orgNoSeed: string | null; // org number as given in the seed, may be empty
  website: string;
  city: string;
  county: string | null;
  segment: "tandvard" | "hud" | string;
}

// A source that was consulted but skipped, and why.
export interface SkippedSource {
  clinicId: string;
  url: string;
  sourceType: SourceType;
  reason: "robots_disallowed" | "rate_limited" | "timeout" | "http_error" | "not_found" | "fetch_error";
  detail?: string;
  attemptedAt: string;
}

export interface ResolvedClinic {
  seed: SeedClinic;
  fields: ResolvedClinicFields;
  sourcesChecked: string[]; // URLs actually fetched (successfully or not)
  sourcesSkipped: SkippedSource[];
  processingErrors: string[];
}