// Vertical-slice demonstration run.
//
// This sandbox's bash/Node process cannot reach arbitrary internet hosts
// (network egress is restricted to package registries — see
// DECISIONS.md). PoliteFetcher itself is a normal internet-capable HTTP
// client (see its unit tests, which mock fetch); it does not need this
// script to run for real in CI or on a developer machine with real
// network access.
//
// To still demonstrate the FULL real pipeline — ingest, source discovery,
// robots/fetch gate, extraction, cross-source resolution, output writing
// — against genuinely real content rather than only isolated unit tests,
// this script injects a fetchFn that serves the two 1177.se pages this
// project fetched via Claude's own web_fetch tool during development
// (test/fixtures/html/1177/*.html) for the two real seed-CSV clinics they
// correspond to. Every other line of the pipeline is exactly the code
// that ships in src/cli.ts's `run` command.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadSeedCsvFromFile } from "../src/ingest/csv.js";
import { processClinics } from "../src/pipeline.js";
import { writeOutputs } from "../src/output/writer.js";
import { WebsiteSource } from "../src/sources/website.js";
import { Registry1177Source, guess1177Url } from "../src/sources/registry1177.js";
import { PoliteFetcher } from "../src/sources/fetcher.js";
import type { SeedClinic } from "../src/model/types.js";

const allClinics = loadSeedCsvFromFile("data/seed-clinics.csv");
const targetNames = ["Bjuvs Tandvårdsteam", "Fjäråstandläkarn"];
const demoClinics = allClinics.filter((c) => targetNames.some((n) => c.name.includes(n)));

if (demoClinics.length !== 2) {
  throw new Error(`Expected 2 demo clinics, found ${demoClinics.length}`);
}

const fixtureByUrl = new Map<string, string>();
for (const clinic of demoClinics) {
  const slug = clinic.name.includes("Bjuv")
    ? "bjuvs-tandvardsteam"
    : clinic.name.includes("Fjärås")
      ? "fjarastandlakarn"
      : "implantatkliniken";
  const html = readFileSync(new URL(`../test/fixtures/html/1177/${slug}-1177.html`, import.meta.url), "utf8");
  fixtureByUrl.set(guess1177Url(clinic), html);
}

const fetchFn: typeof fetch = async (input) => {
  const url = input.toString();
  if (url.endsWith("/robots.txt")) return new Response("User-agent: *\n", { status: 200 });
  if (fixtureByUrl.has(url)) return new Response(fixtureByUrl.get(url)!, { status: 200, headers: { "content-type": "text/html" } });
  // The clinic's own website: this demo has real 1177.se fixtures but not
  // a real capture of these two clinics' own homepages, so report those
  // honestly as unavailable rather than fabricating page content for
  // them. This is exactly the "source unavailable, recorded not
  // pretended" path the brief requires, exercised for real here.
  return new Response("not available in this sandbox demo", { status: 404 });
};

const fetcher = new PoliteFetcher({ fetchFn, minDelayPerHostMs: 0 });
const sources = [new WebsiteSource(), new Registry1177Source()];

const results = await processClinics(demoClinics, {
  sources,
  fetcher,
  onClinicDone: (clinic, i, total) => {
    console.log(`[${i + 1}/${total}] ${clinic.seed.name}`);
    console.log(`  sourcesChecked: ${clinic.sourcesChecked.join(", ")}`);
    console.log(`  sourcesSkipped: ${clinic.sourcesSkipped.map((s) => `${s.url} (${s.reason})`).join(", ") || "none"}`);
  },
});

mkdirSync("output/demo", { recursive: true });
writeOutputs("output/demo", results);
console.log("\nWrote output/demo/{clinics,quality-report,run-report}.json");