// fetcher.ts is the safe HTTP layer of the pipeline.

// Checks robots.txt before accessing a website.
// Waits 2 seconds between requests to the same host.
// Uses an 8-second timeout.
// Retries temporary failures like 429 and 5xx.
// Handles 404, timeout, and network errors without stopping the whole pipeline.
// Returns structured success/failure results so skipped sources can be recorded.
// Adds the pipeline's User-Agent to requests.

// In simple terms:

// robots.ts → “Are we allowed to access this website?”
// fetcher.ts → “If yes, fetch it politely and safely.”
// source/extractor → “Now extract the clinic data from it.”


import { isAllowedByRobots, USER_AGENT } from "./robots.js";
import type { FetchOutcome } from "./types.js";
import type { SourceType } from "../model/types.js";

export interface FetcherOptions {
  /** Minimum gap between two requests to the same host, in ms. */
  minDelayPerHostMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  fetchFn?: typeof fetch;
}

const DEFAULTS: Required<FetcherOptions> = {
  minDelayPerHostMs: 2000,
  timeoutMs: 8000,
  maxRetries: 2,
  backoffBaseMs: 500,
  fetchFn: fetch,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
  Polite fetcher: checks robots.txt, enforces a minimum per-host delay, retries transient failures with backoff, and always returns an outcome rather than throwing — a fetch failure for one clinic must never stop the pipeline. Every non-ok outcome is a fully-formed SkippedSource the caller can record.
 */

export class PoliteFetcher {
  private readonly opts: Required<FetcherOptions>;
  private readonly lastRequestAtByHost = new Map<string, number>();

  constructor(opts: FetcherOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  private async waitForHostSlot(host: string): Promise<void> {
    const last = this.lastRequestAtByHost.get(host);
    const now = Date.now();
    if (last !== undefined) {
      const elapsed = now - last;
      const remaining = this.opts.minDelayPerHostMs - elapsed;
      if (remaining > 0) await sleep(remaining);
    }
    this.lastRequestAtByHost.set(host, Date.now());
  }

  async fetch(clinicId: string, url: string, sourceType: SourceType): Promise<FetchOutcome> {
    const now = () => new Date().toISOString();
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return {
        ok: false,
        skip: { clinicId, url, sourceType, reason: "fetch_error", detail: "invalid URL", attemptedAt: now() },
      };
    }

    const robots = await isAllowedByRobots(url, this.opts.fetchFn, this.opts.timeoutMs);
    if (!robots.allowed) {
      return {
        ok: false,
        skip: {
          clinicId,
          url,
          sourceType,
          reason: "robots_disallowed",
          detail: `disallowed by ${robots.robotsUrl}`,
          attemptedAt: now(),
        },
      };
    }

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      await this.waitForHostSlot(host);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        const res = await this.opts.fetchFn(url, {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        });
        clearTimeout(timer);

        if (res.status === 404) {
          return { ok: false, skip: { clinicId, url, sourceType, reason: "not_found", attemptedAt: now() } };
        }
        if (res.status === 429 || res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          if (attempt < this.opts.maxRetries) {
            await sleep(this.opts.backoffBaseMs * 2 ** attempt);
            continue;
          }
          return {
            ok: false,
            skip: { clinicId, url, sourceType, reason: "http_error", detail: lastError, attemptedAt: now() },
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            skip: { clinicId, url, sourceType, reason: "http_error", detail: `HTTP ${res.status}`, attemptedAt: now() },
          };
        }

        const body = await res.text();
        return {
          ok: true,
          url,
          status: res.status,
          contentType: res.headers.get("content-type"),
          body,
          fetchedAt: now(),
        };
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastError = isAbort ? "timeout" : err instanceof Error ? err.message : String(err);
        if (attempt < this.opts.maxRetries) {
          await sleep(this.opts.backoffBaseMs * 2 ** attempt);
          continue;
        }
        return {
          ok: false,
          skip: {
            clinicId,
            url,
            sourceType,
            reason: isAbort ? "timeout" : "fetch_error",
            detail: lastError,
            attemptedAt: now(),
          },
        };
      }
    }

    // Unreachable in practice (loop always returns), but keeps the type checker honest about every path returning a FetchOutcome.
    return {
      ok: false,
      skip: { clinicId, url, sourceType, reason: "fetch_error", detail: lastError ?? "unknown", attemptedAt: now() },
    };
  }
}
