// This file checks whether the pipeline is allowed to access a website according to its robots.txt file.

// It:
// Fetches and parses robots.txt.
// Caches the result for 30 minutes.
// Checks whether VardixTrialBot is allowed to access a URL.
// Uses a timeout to avoid hanging requests.
// Treats unavailable robots.txt as allowed with caution.
// Provides clearRobotsCache() for testing.

import robotsParser, { type Robot } from "robots-parser";

const USER_AGENT = "VardixTrialBot/0.1 (+https://vardix.example/bot)";

interface RobotsCacheEntry {
  robot: Robot | null; // null means robots.txt fetch failed; treat as allow-with-caution
  fetchedAt: number;
}

const cache = new Map<string, RobotsCacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes 

function robotsUrlFor(pageUrl: string): string {
  const u = new URL(pageUrl);
  return `${u.protocol}//${u.host}/robots.txt`;
}

/**
 Fetches (or reuses a cached) robots.txt for the domain of the given URL, using the injected fetch function so this stays testable and so it goes through the same network path as everything else.
 */
async function getRobot(
  pageUrl: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<Robot | null> {
  const robotsUrl = robotsUrlFor(pageUrl);
  const cached = cache.get(robotsUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.robot;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchFn(robotsUrl, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
    clearTimeout(timer);
    if (!res.ok) {
      // No robots.txt, or it errors: convention is to treat as allow-all.
      cache.set(robotsUrl, { robot: null, fetchedAt: Date.now() });
      return null;
    }
    const text = await res.text();
    const robot = robotsParser(robotsUrl, text);
    cache.set(robotsUrl, { robot, fetchedAt: Date.now() });
    return robot;
  } catch {
    // Network failure fetching robots.txt itself. Fail open (allow), the convention most crawlers use, but this is a judgement call — see DECISIONS.md. We do NOT fail closed here because that would make a transient network blip look identical to an explicit disallow.
    cache.set(robotsUrl, { robot: null, fetchedAt: Date.now() });
    return null;
  }
}

export interface RobotsCheckResult {
  allowed: boolean;
  robotsUrl: string;
}

export async function isAllowedByRobots(
  pageUrl: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<RobotsCheckResult> {
  const robotsUrl = robotsUrlFor(pageUrl);
  const robot = await getRobot(pageUrl, fetchFn, timeoutMs);
  if (robot === null) return { allowed: true, robotsUrl };
  const allowed = robot.isAllowed(pageUrl, USER_AGENT) ?? true;
  return { allowed, robotsUrl };
}

export function clearRobotsCache(): void {
  cache.clear();
}

export { USER_AGENT };