# Decisions

## Decision 001 — TypeScript and Node.js

We use TypeScript and Node.js for the pipeline.

Reason:
The project is primarily a data-processing CLI.
TypeScript provides strong types for evidence and source contracts.

## Decision 002 — No Database

We do not use a database.

Reason:
The assessment requires a one-command data pipeline.
The input and output are file-based.


## Decision 003 - Robots.txt Failure Handling

We use a fail-open approach when `robots.txt` cannot be retrieved.

If the file is missing or the request fails due to a network error or server error, the pipeline continues with caution instead of blocking the source.

Explicit `Disallow` rules are always respected.

This prevents temporary robots.txt failures from stopping the entire pipeline. Skipped sources and fetch failures are still recorded.


## Decision 003 - Dental Subsidy Evidence

The pipeline requires explicit evidence before marking a clinic as connected to the Swedish state dental subsidy scheme.

A clinic providing dental care does not prove subsidy participation.

The subsidy extractor therefore looks for explicit subsidy-related terms or statements in the source text.

If the source does not provide sufficient evidence, the pipeline does not guess. It records the field as unconfirmed or unknown based on source availability.


## Dependencies 004

Kept deliberately small and each individually justified: `csv-parse`
(CSV parsing), `cheerio` (HTML parsing/traversal), `robots-parser`
(robots.txt),
`tsx`/`typescript`/`vitest` (dev tooling). No dependency was added
without a specific line of code that needed it.


## Testing philosophy 005

Every extractor and source has tests written against messy,
real-world-shaped input — including, wherever this session could obtain
it, genuinely fetched real Swedish clinic data — not just clean
happy-path strings. This caught real bugs before they reached even the
gold-set stage: a newline-collapsing bug in opening-hours parsing, a
greedy address regex, a missing space variant in the service vocabulary,
a stale import path, and (found only once real gold-set data was run
through the pipeline) a phone-normalization double-count and an
all-caps-city address bug. The volume of real bugs caught this way is
itself evidence for testing against real content rather than only
synthetic fixtures.


## Decision 006 - Deliberately Long-Running Fetches

The pipeline accepts a potentially long runtime for the initial full
run. A run over approximately 300 clinics may take around two hours
because requests are checked against `robots.txt`, delayed per host,
and retried when temporary failures occur. Clinic processing uses a
small bounded worker pool, while requests to the same host remain
serialized and rate-limited.

This trade-off favors respectful access to third-party websites,
stable output ordering, simple failure isolation, and broader evidence
coverage over maximum throughput. The website source currently fetches
the homepage plus a small set of likely contact/booking paths rather than
crawling the whole site, which balances booking coverage against request
volume.

Because the worker pool processes several clinics at the same time,
console progress messages appear in completion order rather than strict
clinic order. A slow clinic can therefore finish after clinics that
started later. This is intentional: the returned results and written
output retain the original input order, while completion-order logging
allows finished work to be reported immediately instead of blocking on
an earlier slow clinic.

The accepted costs are high wall-clock time, limited scalability, and
poor suitability for interactive or frequent refresh workflows. A
production version should preserve robots compliance while adding
per-host concurrency, caching, resumable checkpoints, and per-request
timing so that the runtime can be reduced and measured without turning
the crawler into an uncontrolled burst of traffic.


## Decision 007 - Gold-Set Size and Honest Evaluation

The hand-labelled gold set currently contains 26 clinics, while the brief
asks for approximately 30. We disclose the four-row gap instead of
fabricating labels or treating unverified records as ground truth.

Gold identity matching uses stable IDs, normalized organization numbers,
labelled source domains, and normalized name plus city. When a gold clinic
cannot be matched to pipeline output, every verified positive field on that
gold row is counted as a false negative. This prevents recall from being
inflated by silently excluding unmatched clinics; null or unknown gold
fields are not scored as misses because no actual value exists to compare.


## Decision 008 - Organization-Number Evidence Boundary

The pipeline does not currently use an authoritative company-registry
source. It accepts an organization number only when clinic website text
contains a format-valid, Luhn-valid candidate, and records that candidate
as lower-confidence evidence. Luhn validation checks shape and checksum;
it does not establish that the number belongs to the clinic.

The accepted trade-off is lower organization-number recall in exchange for
not presenting unverified registry claims as facts. A production extension
should add an authoritative registry source and retain the current website
candidate as separate evidence for conflict detection.


## Decision 009 - Opening-Hours Evidence Boundary

Opening hours are extracted deterministically from visible raw HTML and
schema.org JSON-LD when those values are present in the HTTP response.
The parser supports Swedish and English weekday names, abbreviated days,
day ranges, dot or colon times, closed days, compact adjacent segments,
and `openingHoursSpecification` records. Extracted schedules retain the
source text as reviewer-facing evidence and continue through the existing
confidence and conflict resolution path.

The accepted limitation is that client-side JavaScript-rendered hours
are not available to the current HTTP-only fetcher. The repository stores
three HTML fixtures, which all have focused extraction coverage; the
checked-in 300-clinic output predates this fix and must be regenerated in
a network-capable environment before post-fix full-run coverage is claimed.


## Decision 010 - Source-Faithful Phone Values

Phone values in resolved output preserve the source representation. A
displayed local value such as `45110050` remains `45110050`, and an
explicit international value such as `+4645110050` remains unchanged.
When a `tel:` link has both a display label and a target, the display
label is preferred; the target is used only when no display value exists.

Country-code conversion is used only for equality and evaluation so that
`45110050`, `0451-10050`, and `+4645110050` can be compared as the same
number without rewriting the evidence-backed output. The trade-off is
that consumers must not assume `phone.value` is E.164.


## Decision 011 - Booking Discovery Boundary

The website source checks the homepage and a bounded set of likely
booking/contact paths. On each fetched page it scores normal links,
buttons, forms, iframes, data attributes, and static `onclick` URLs,
including external providers such as Frenda and Opus Dental Online.

Generic contact/services URLs, social links, phone/mail links, invalid
JavaScript URLs, and bare mentions of booking without a destination remain
excluded. The accepted limitation is that URLs created only after
client-side JavaScript executes are not reliably discoverable by the
HTTP-only crawler; browser automation would be a separate architectural
decision.


## Decision 012 - Honest Missing-Field Coverage

The completed baseline run populated opening hours for 80 of 300 clinics
and booking URLs for 143 of 300 clinics. We do not convert the remaining
records into guesses merely to improve those percentages. A missing value
is retained when raw HTTP responses contain no specific, reviewable
schedule or booking destination.

The accepted causes include robots or HTTP failures, timeouts, generic or
variable-hours prose, and destinations generated only after client-side
JavaScript runs. A contact page, services page, homepage, or text
mentioning booking is not sufficient evidence by itself. The trade-off is
lower recall in exchange for precision, source-faithful evidence, and
defensible recruiter-facing results.

The 80/300 and 143/300 figures are baseline output counts. Because the
latest extractor changes have not yet been applied to a completed live
300-clinic rerun, new post-fix coverage must be reported only after a
network-capable run completes.