#!/usr/bin/env node
import { loadSeedCsvFromFile, validateSeedRows } from "./ingest/csv.js";
import { processClinics } from "./pipeline.js";
import { writeOutputs } from "./output/writer.js";
import { WebsiteSource } from "./sources/website.js";
import { Registry1177Source } from "./sources/registry1177.js";
import { PoliteFetcher } from "./sources/fetcher.js";
import { runGoldSetEvaluation } from "./eval/metrics.js";
import { readFileSync, writeFileSync } from "node:fs";


// npm run pipeline -- run
//               ↓
//             cli.ts
//               ↓
//     ┌─────────┴─────────┐
//     ↓                   ↓
//  Read seed CSV       Run pipeline
//     ↓                   ↓
//  Validate            Fetch sources
//     ↓                   ↓
//  Load clinics       Extract evidence
//                         ↓
//                     Resolve fields
//                         ↓
//                   Write output files

const SEED_CSV_PATH = "data/seed-clinics.csv";
const OUTPUT_DIR = "output";
const GOLD_SET_PATH = "gold-set/gold-clinics.json";

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const arg of rest) {
    const m = arg.match(/^--([a-zA-Z-]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) flags[m[1]] = m[2];
  }
  return { command, flags };
}

async function runCommand(flags: Record<string, string>): Promise<void> {
  const csvText = readFileSync(SEED_CSV_PATH, "utf8");
  const issues = validateSeedRows(csvText);
  if (issues.length > 0) {
    console.warn(`[ingest] ${issues.length} seed row issue(s):`);
    for (const issue of issues.slice(0, 10)) console.warn(`  - row ${issue.rowIndex} (${issue.name ?? "?"}): ${issue.issue}`);
    if (issues.length > 10) console.warn(`  ...and ${issues.length - 10} more`);
  }

  let clinics = loadSeedCsvFromFile(SEED_CSV_PATH);

  const limit = flags.limit ? Number(flags.limit) : undefined;
  if (limit) clinics = clinics.slice(0, limit);

  if (flags.only) {
    const ids = new Set(flags.only.split(","));
    clinics = clinics.filter((c) => ids.has(c.id));
  }

  console.log(`[run] processing ${clinics.length} clinic(s)...`);

  const fetcher = new PoliteFetcher();
  const sources = [new WebsiteSource(), new Registry1177Source()];

  const results = await processClinics(clinics, {
    sources,
    fetcher,
    onClinicDone: (clinic, i, total) => {
      const conflicts = Object.values(clinic.fields).filter((f) => f.conflict).length;
      console.log(`[${i + 1}/${total}] ${clinic.seed.name} — ${clinic.sourcesSkipped.length} skipped, ${conflicts} conflict(s)`);
    },
  });

  writeOutputs(OUTPUT_DIR, results);
  console.log(`[run] done. Wrote ${OUTPUT_DIR}/clinics.json, quality-report.json, run-report.json`);
}

async function evalCommand(): Promise<void> {
  const goldSet = JSON.parse(readFileSync(GOLD_SET_PATH, "utf8"));
  const clinicsPath = `${OUTPUT_DIR}/clinics.json`;
  let resolvedClinics;
  try {
    resolvedClinics = JSON.parse(readFileSync(clinicsPath, "utf8"));
  } catch {
    console.error(`[eval] could not read ${clinicsPath} — run 'npm run pipeline' first.`);
    process.exitCode = 1;
    return;
  }

  const report = runGoldSetEvaluation(goldSet, resolvedClinics);
  writeFileSync(`${OUTPUT_DIR}/eval-report.json`, JSON.stringify(report, null, 2), "utf8");
  console.log(`[eval] wrote ${OUTPUT_DIR}/eval-report.json`);
  for (const field of report.perField) {
    console.log(
      `  ${field.field.padEnd(16)} precision=${field.precision.toFixed(2)} recall=${field.recall.toFixed(2)} (n=${field.goldCount})`,
    );
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "run") await runCommand(flags);
  else if (command === "eval") await evalCommand();
  else {
    console.error("Usage: cli.ts <run|eval> [--limit=N] [--only=id1,id2]");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});