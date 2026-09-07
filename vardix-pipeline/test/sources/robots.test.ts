import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRobotsCache, isAllowedByRobots } from "../../src/sources/robots.js";

function mockFetch(robotsTxt: string | null, status = 200) {
  return vi.fn(async (_url: string | URL) => {
    if (robotsTxt === null) {
      return new Response("not found", { status: 404 });
    }
    return new Response(robotsTxt, { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  clearRobotsCache();
});

describe("isAllowedByRobots", () => {
  it("allows a path with no matching Disallow rule", async () => {
    const fetchFn = mockFetch("User-agent: *\nDisallow: /admin\n");
    const r = await isAllowedByRobots("https://clinic.example/kontakt", fetchFn);
    expect(r.allowed).toBe(true);
  });

  it("disallows a path explicitly blocked for all agents", async () => {
    const fetchFn = mockFetch("User-agent: *\nDisallow: /kontakt\n");
    const r = await isAllowedByRobots("https://clinic.example/kontakt", fetchFn);
    expect(r.allowed).toBe(false);
  });

  it("treats a missing robots.txt as allow-all", async () => {
    const fetchFn = mockFetch(null);
    const r = await isAllowedByRobots("https://clinic.example/kontakt", fetchFn);
    expect(r.allowed).toBe(true);
  });

  it("fails open when the robots.txt fetch itself throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const r = await isAllowedByRobots("https://clinic.example/kontakt", fetchFn);
    expect(r.allowed).toBe(true);
  });

  it("disallows a full-site block", async () => {
    const fetchFn = mockFetch("User-agent: *\nDisallow: /\n");
    const r = await isAllowedByRobots("https://clinic.example/anything", fetchFn);
    expect(r.allowed).toBe(false);
  });

  it("caches the robots.txt fetch across repeated calls to the same host", async () => {
    const fetchFn = mockFetch("User-agent: *\nDisallow: /admin\n");
    await isAllowedByRobots("https://clinic.example/a", fetchFn);
    await isAllowedByRobots("https://clinic.example/b", fetchFn);
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});