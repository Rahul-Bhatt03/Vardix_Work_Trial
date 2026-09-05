import type { ResolvedClinic, SeedClinic, SkippedSource } from "./model/types.js";
import type { Source } from "./sources/types.js";
import { PoliteFetcher } from "./sources/fetcher.js";
import { resolveClinicFields } from "./resolve/clinic.js";

export interface PipelineOptions {
  sources: Source[];
  fetcher?: PoliteFetcher;
  /** Called after each clinic finishes, useful for progress reporting on a 300-row run. */
  onClinicDone?: (clinic: ResolvedClinic, index: number, total: number) => void;
}

/**
 * Runs one clinic through every configured source. A source's own
 * discover() may return more than one candidate URL (currently only
 * relevant to sources that guess at a URL, like the 1177 registry); we
 * try candidates in order and stop at the first that fetches
 * successfully, recording every failed attempt as a skip.
 */
export async function processClinic(clinic: SeedClinic, opts: PipelineOptions): Promise<ResolvedClinic> {
  const fetcher = opts.fetcher ?? new PoliteFetcher();
  const rawEvidenceList = [];
  const sourcesChecked: string[] = [];
  const sourcesSkipped: SkippedSource[] = [];
  const processingErrors: string[] = [];

  for (const source of opts.sources) {
    const candidates = source.discover(clinic);
    let succeeded = false;

    for (const url of candidates) {
      try {
        const outcome = await fetcher.fetch(clinic.id, url, source.sourceType);
        sourcesChecked.push(url);
        if (!outcome.ok) {
          sourcesSkipped.push(outcome.skip);
          continue; // try the next candidate URL from this source, if any
        }
        const evidence = source.extract(clinic, outcome);
        rawEvidenceList.push(evidence);
        succeeded = true;
        break; // this source is done for this clinic
      } catch (err) {
        // A source's extract() throwing (malformed HTML tripping up a
        // selector, etc.) must not take down the whole clinic, let alone
        // the whole run. Record it and move on.
        processingErrors.push(`${source.name} on ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!succeeded && candidates.length === 0) {
      // Source declined to even propose a URL for this clinic (not
      // currently used by any source, but a legitimate outcome to allow).
      continue;
    }
  }

  const fields = resolveClinicFields(rawEvidenceList);

  return {
    seed: clinic,
    fields,
    sourcesChecked,
    sourcesSkipped,
    processingErrors,
  };
}

export async function processClinics(clinics: SeedClinic[], opts: PipelineOptions): Promise<ResolvedClinic[]> {
  const results: ResolvedClinic[] = [];
  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i]!;
    const result = await processClinic(clinic, opts);
    results.push(result);
    opts.onClinicDone?.(result, i, clinics.length);
  }
  return results;
}