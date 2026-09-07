# Vardix clinic data pipeline

An evidence-first data pipeline that resolves facts about ~300 Swedish
dental and skin clinics — canonical name, organisation number, visiting
address, phone, email, opening hours, services offered, state dental
subsidy connection, and an online booking URL — from public sources.

Every field carries its source URL, a confidence score, and a conflict
flag when sources disagree. A field the pipeline could not verify is
`null`, not a guess. See `DECISIONS.md` and `EVALUATION.md` for the
reasoning behind the significant choices and the current evaluation state.

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
- `src/pipeline.ts` — orchestrates the above per clinic; never lets one
  bad clinic or source take down the run.
- `src/output/writer.ts` — writes the three output files.
- `src/eval/` — gold-set evaluation (precision/recall per field).
- `src/cli.ts` — the `run` and `eval` commands.

This checked-in repository is intentionally deterministic: there is no
`src/llm/` implementation or live LLM-backed extractor in the shipped code.
The current pipeline relies on public-source HTML extraction and explicit
source evidence rather than model-based guessing.

## Setup

```
npm install
```

No environment variables are required to run the deterministic pipeline.
The current checked-in implementation does not require or use any API keys.

## Commands

```
npm run build       # compile src/
npm run typecheck    # typecheck src/ + test/
  npm test             # run the test suite
npm run pipeline      # run the real pipeline against data/seed-clinics.csv -> output/
npm run eval          # score output/clinics.json against gold-set/gold-clinics.json -> output/eval-report.json
```

### Selecting Run Size

The `pipeline` npm script already invokes the `run` command. Use the
following forms when deciding how much data to fetch:

```text
npm run pipeline -- --limit=10       # first 10 seed clinics; quick demo
npm run pipeline -- --limit=50       # first 50 clinics; review batch
npm run pipeline                    # all 300 clinics
npm run pipeline -- --only=clinic-id-1,clinic-id-2  # exact seed IDs
```

`--limit` selects the first N rows from `data/seed-clinics.csv` after
ingestion and validates that N is a positive integer. `--only` selects
exact stable clinic IDs. Both filters can be combined; `--only` is applied
after `--limit`, so use `--only` alone when exact IDs must be selected from
the complete seed file.

Every run rewrites `output/clinics.json`, `quality-report.json`, and
`run-report.json` for the selected clinics. Run `npm run eval` afterward
only when the output represents the intended evaluation set; a limited run
is useful for demos and debugging, but is not a 300-clinic coverage report.

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
  demo/                 # a small example run kept for review and demos
```

Every clinic record can answer: what value was chosen, why, which
source(s) support it, how confident the pipeline is, whether sources
disagreed, which sources were checked, which were skipped and why, and
when each was fetched.

## Known limitations

### Why Some Fields Remain Null

Null values are intentional when the available source evidence is not
specific enough to support a claim. The pipeline does not infer clinic
hours from generic text such as "open every day", treat telephone hours
as clinic hours, or use a contact/services page as a booking destination
unless it contains an actual booking link.

The previous completed 300-clinic output contained opening hours for
80/300 clinics and booking URLs for 143/300 clinics. The other records
were commonly affected by robots restrictions, 404s, timeouts, network
errors, generic or variable-hours text, or booking widgets whose
destination is created only after JavaScript executes. The HTTP crawler
cannot reliably see client-side content without browser automation.

These are baseline populated-record counts, not claims that the other
clinics have no hours or booking capability. A fresh network-backed run
with the current extractors is required before reporting post-fix
coverage. Leaving a field null when evidence is missing is deliberate:
a plausible but unsupported value would be worse than an honest gap.

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
  `EVALUATION.md` and the gold-set JSON for the current evaluation and
  matching constraints.
- **Website discovery is intentionally bounded** — it checks the
  homepage and likely contact/booking paths, plus static booking controls,
  but cannot see URLs created only after JavaScript executes.
- **Phone output is source-faithful** — E.164-like conversion is used for
  comparison only, so consumers should not assume `phone.value` is always
  normalized.

See `DECISIONS.md` for the full reasoning and extension trade-offs in this
project.
