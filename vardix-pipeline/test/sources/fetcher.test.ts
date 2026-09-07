import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRobotsCache } from "../../src/sources/robots.js";
import { PoliteFetcher } from "../../src/sources/fetcher.js";

beforeEach(() => {
  clearRobotsCache();
});

/** Builds a fetch mock that always allows robots.txt and returns a canned response for the page URL. */
function mockFetchSequence(pageResponses: (Response | Error)[]) {
  let call = 0;
  return vi.fn(async (url: string | URL) => {
    const u = url.toString();
    if (u.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
    const next = pageResponses[Math.min(call, pageResponses.length - 1)];
    call++;
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
}

describe("PoliteFetcher", () => {
  it("returns ok:true with the body on a normal 200", async () => {
    const fetchFn = mockFetchSequence([new Response("<html>hello</html>", { status: 200, headers: { "content-type": "text/html" } })]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0 });
    const r = await f.fetch("clinic-1", "https://clinic.example/", "clinic_website");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toContain("hello");
  });

  it("returns a robots_disallowed skip without attempting the page fetch", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0 });
    const r = await f.fetch("clinic-1", "https://clinic.example/blocked", "clinic_website");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skip.reason).toBe("robots_disallowed");
  });

  it("returns a not_found skip on 404 without retrying", async () => {
    const fetchFn = mockFetchSequence([new Response("nope", { status: 404 })]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0 });
    const r = await f.fetch("clinic-1", "https://clinic.example/gone", "clinic_website");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skip.reason).toBe("not_found");
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter((c) => !c[0].toString().endsWith("robots.txt")).length).toBe(1);
  });

  it("retries a 500 up to maxRetries, then reports http_error", async () => {
    const fetchFn = mockFetchSequence([
      new Response("err", { status: 500 }),
      new Response("err", { status: 500 }),
      new Response("err", { status: 500 }),
    ]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 2, backoffBaseMs: 1 });
    const r = await f.fetch("clinic-1", "https://clinic.example/flaky", "clinic_website");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skip.reason).toBe("http_error");
    const pageCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter((c) => !c[0].toString().endsWith("robots.txt"));
    expect(pageCalls.length).toBe(3); // initial + 2 retries
  });

  it("succeeds after one transient 500 followed by a 200", async () => {
    const fetchFn = mockFetchSequence([new Response("err", { status: 500 }), new Response("<html>ok</html>", { status: 200 })]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 2, backoffBaseMs: 1 });
    const r = await f.fetch("clinic-1", "https://clinic.example/recovering", "clinic_website");
    expect(r.ok).toBe(true);
  });

  it("reports a timeout as its own skip reason, not a generic fetch_error", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as unknown as typeof fetch;
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, timeoutMs: 20, maxRetries: 0 });
    const r = await f.fetch("clinic-1", "https://clinic.example/slow", "clinic_website");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skip.reason).toBe("timeout");
  });

  it("never throws for one bad clinic — always returns a well-formed outcome", async () => {
    const fetchFn = mockFetchSequence([new Error("DNS failure")]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 });
    await expect(f.fetch("clinic-1", "https://clinic.example/", "clinic_website")).resolves.toBeDefined();
  });

  it("reports fetch_error with a message for a rejected network call", async () => {
    const fetchFn = mockFetchSequence([new Error("DNS failure")]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0, maxRetries: 0 });
    const r = await f.fetch("clinic-1", "https://clinic.example/", "clinic_website");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.skip.reason).toBe("fetch_error");
      expect(r.skip.detail).toContain("DNS failure");
    }
  });

  it("enforces a minimum delay between two requests to the same host", async () => {
    const fetchFn = mockFetchSequence([
      new Response("a", { status: 200 }),
      new Response("b", { status: 200 }),
    ]);
    const f = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 50 });
    const start = Date.now();
    await f.fetch("clinic-1", "https://clinic.example/a", "clinic_website");
    await f.fetch("clinic-1", "https://clinic.example/b", "clinic_website");
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});