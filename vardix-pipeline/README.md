# Vardix clinic data pipeline

An evidence-first data pipeline that resolves facts about ~300 Swedish
dental and skin clinics — canonical name, organisation number, visiting
address, phone, email, opening hours, services offered, state dental
subsidy connection, and an online booking URL — from public sources.

Every field carries its source URL, a confidence score, and a conflict
flag when sources disagree. A field the pipeline could not verify is
`null`, not a guess. See `DECISIONS.md` for the reasoning behind every
significant choice below, and `gold-set/README.md` before judging the
evaluation numbers.

## What this does

```
seed-clinics.csv
  → ingest (CSV → typed clinics)
  → for each clinic, for each source (clinic's own website, 1177.se):
      → robots.txt + rate-limit gate → fetch → extract → raw evidence
  → merge evidence across sources → resolved fields with confidence/conflict
  → output/clinics.json, quality-report.json, run-report.json
  → npm run eval scores output/clinics.json against a hand-labelled gold set
```

## Architecture

- `src/model/types.ts` — the evidence-first data model everything else builds on.
- `src/ingest/csv.ts` — seed CSV parsing.
- `src/sources/` — the pluggable source interface, a polite rate-limited
  fetcher with a robots.txt gate, and two source implementations
  (clinic website, 1177.se).
- `src/extract/` — deterministic Swedish-aware extractors: phone, org
  number (Luhn-validated), opening hours, address, booking-link scoring,
  dental-subsidy detection, and a service vocabulary matcher.
- `src/resolve/` — cross-source conflict detection and confidence merging.
- `src/llm/` — an LLM provider abstraction (graceful no-key degradation)
  and one narrow LLM-assisted extractor for messy service text.
- `src/pipeline.ts` — orchestrates the above per clinic; never lets one
  bad clinic or source take down the run.
- `src/output/writer.ts` — writes the three output files.
- `src/eval/` — gold-set evaluation (precision/recall per field).
- `src/cli.ts` — the `run` and `eval` commands.

## Setup

```
npm install
```

No environment variables are required to run the deterministic pipeline.

### Environment variables (optional, LLM-assisted extraction only)

| Variable | Required | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | none — LLM extraction is skipped if unset |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` |
| `ANTHROPIC_BASE_URL` | No | `https://api.anthropic.com` |

The pipeline runs to completion with all deterministic extraction intact
whether or not these are set. See `DECISIONS.md`, "LLM usage."

## Commands

```
npm run build       # compile src/
npm run typecheck    # typecheck src/ + test/
  npm test             # run the test suite
npm run pipeline      # run the real pipeline against data/seed-clinics.csv -> output/
npm run eval          # score output/clinics.json against gold-set/gold-clinics.json -> output/eval-report.json
```

`npm run pipeline` needs real internet access (it fetches ~300 clinics'
websites and 1177.se pages, politely and rate-limited). It will not work
in a network-restricted sandbox — see `DECISIONS.md` for how this
project validated its own correctness without one, using
`scripts/vertical-slice-demo.ts` and genuinely fetched fixture data.

## Output structure

```
output/
  clinics.json          # full resolved records with evidence, per clinic
  quality-report.json   # resolved/null/conflict counts + avg confidence, per field
  run-report.json       # sources checked/skipped by reason, processing errors
  eval-report.json      # (after `npm run eval`) precision/recall per field
  sample/               # a real (not hand-written) run's output, committed for review
```

Every clinic record can answer: what value was chosen, why, which
source(s) support it, how confident the pipeline is, whether sources
disagreed, which sources were checked, which were skipped and why, and
when each was fetched.

## Known limitations

- **Organisation number is the weakest field** — neither source built
  reliably publishes it (1177.se never shows it; most clinic sites
  don't print it). A dedicated registry source is the clearest next
  step. See `DECISIONS.md`.
- **Opening-hours coverage depends on raw HTML availability** — the
  parser now handles compact Swedish text, English/schema.org formats,
  and JSON-LD, but hours rendered only after client-side JavaScript are
  unavailable to the HTTP fetcher. A fresh network-backed run is needed
  to measure post-fix coverage across all 300 clinics.
- **Gold set is 26 clinics, not the ~30 the brief asks for** — built this
  way deliberately rather than risk fabricated labels. The remaining
  four rows are a known evidence gap, not fabricated placeholders. See
  `gold-set/README.md` for why and how to extend it.
- **`WebsiteSource` only fetches the homepage**, not a `/kontakt` or
  `/oppettider` subpage — likely costing recall on phone/hours for sites
  that split content across pages.
 - session, so this path is validated against a fake provider only.
- **The booking-link domain list is the least real-world-validated
  extractor** — see `QUESTIONS.md`.

See `DECISIONS.md` for the full reasoning and `AGENTS.md` for how to
safely extend this project.
