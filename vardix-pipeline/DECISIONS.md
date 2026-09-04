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