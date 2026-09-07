import type { FieldEvidence, FieldName, SeedClinic, SkippedSource, SourceType } from "../model/types.js";

/** Result of trying to fetch one URL for one clinic. */
export type FetchOutcome =
  | { ok: true; url: string; status: number; contentType: string | null; body: string; fetchedAt: string }
  | { ok: false; skip: SkippedSource };

/**
 Raw evidence pulled from one fetched page, before cross-source resolution. A single source can (and usually does) contribute evidence for several fields from one fetch — e.g. a clinic homepage often has phone, address and hours all on one page.
 */
export type RawEvidence = {
  [K in FieldName]?: FieldEvidence<unknown>[];
};

/**
 The interface every source plugin implements. A source is responsible for finding its own candidate URL(s) for a clinic, respecting the fetch gate (robots + rate limit, handled by the shared fetcher), and turning fetched content into evidence. Sources do not resolve conflicts between each other — that is the resolver's job.
 */
export interface Source {
  readonly name: string;
  readonly sourceType: SourceType;
  /** Candidate URLs this source would try for a clinic, most useful first. */
  discover(clinic: SeedClinic): string[];
  /** Turn one fetched page's content into raw field evidence. */
  extract(clinic: SeedClinic, fetched: Extract<FetchOutcome, { ok: true }>): RawEvidence;
}