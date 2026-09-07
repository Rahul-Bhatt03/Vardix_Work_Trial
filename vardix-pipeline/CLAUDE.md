# Claude

## Project

This project is a TypeScript/Node.js data pipeline for the Vardix technical assessment.

The pipeline enriches Swedish dental and skin clinic records from:

`data/seed-clinics.csv`

The final pipeline must produce structured clinic data with evidence, confidence, and conflict information.

Required fields:

* canonical name
* organization number
* visiting address
* phone
* email
* opening hours
* care services
* state dental subsidy connection
* online booking URL

The pipeline must be reproducible and runnable from the command line.

---

## 1. Core Principle

**Never guess data.**

If a value cannot be supported by reliable evidence, return it as unresolved.

For every extracted field, preserve:

* value
* source URL
* source type
* confidence
* conflict status
* evidence text when available
* retrieval timestamp
* extraction method

An unresolved value is acceptable.

An unsupported value is not.

---

## 2. Evidence-First Design

Do not store extracted values without their evidence.

Use an evidence-first model:

```text
Source
  ↓
Raw Evidence
  ↓
Normalized Evidence
  ↓
Resolved Field
  ↓
Final Clinic Record
```

Keep source evidence even when another source is selected as the final value.

If two reliable sources disagree, mark the field as conflicting.

Do not silently discard conflicting evidence.

---

## 3. Architecture

Keep these responsibilities separate:

### Ingestion

Reads and validates the seed CSV.

```text
src/ingest/
```

### Sources

Understand specific public sources and extract evidence.

```text
src/sources/
```

Examples:

* clinic website
* 1177
* registry
* map listing

### HTTP Fetching

Responsible for:

* HTTP requests
* timeouts
* retries
* rate limiting
* robots.txt
* HTTP errors

Do not put generic HTTP behavior inside individual source implementations.

### Extraction

Contains deterministic field extraction logic.

```text
src/extract/
```

### Normalization

Normalizes values before comparison.

```text
src/normalize/
```

Do not destroy the original source value.

### Resolution

Compares evidence and selects the best supported value.

```text
src/resolve/
```

### Evaluation

Measures the pipeline against the manually verified gold set.

```text
src/eval/
```

### Output

Writes final JSON, CSV, and quality reports.

```text
src/output/
```

---

## 4. Source Contract

Sources should follow a common interface.

A source should be responsible for:

1. discovering relevant URLs
2. interpreting source content
3. producing raw evidence

A source should not own:

* global rate limiting
* robots policy
* retry policy
* final conflict resolution

Keep those responsibilities in separate modules.

---

## 5. Public Sources

Use public sources only.

Potential sources include:

* clinic websites
* 1177.se
* public company/registry information
* public map listings

Do not:

* bypass authentication
* bypass access controls
* use private accounts
* use leaked credentials
* scrape private information

If a source requires unavailable authentication, record it as unavailable rather than trying to bypass it.

---

## 6. Robots and Rate Limits

Respect:

* robots.txt
* server restrictions
* rate limits
* reasonable request frequency

Use polite crawling.

At minimum, HTTP handling should support:

```text
timeout
retry
429
404
5xx
network failure
robots disallowed
```

A failed source must not stop the entire pipeline.

Record skipped sources and processing errors.

---

## 7. Clinic Processing

One bad clinic must not terminate the complete run.

Prefer:

```text
Clinic A → success
Clinic B → timeout
Clinic C → success
Clinic D → robots blocked
Clinic E → success
```

The pipeline should continue processing A, C, and E.

B and D must contain appropriate error or skipped-source information.

---

## 8. Data Accuracy Rules

Be conservative when extracting data.

### Organization Number

Do not treat every ten-digit number as an organization number.

Normalize equivalent formats before comparison.

### Phone

Normalize Swedish phone formats before comparison.

Do not mistake:

* organization numbers
* postal codes
* dates
* opening hours

for phone numbers.

### Email

Only extract explicitly present email addresses.

Never construct an email address from the clinic name or domain.

### Address

Prefer explicit visiting/contact addresses.

Do not assume that every address-like string is the clinic's visiting address.

### Opening Hours

Distinguish clinic opening hours from:

* telephone hours
* appointment hours
* support hours

Do not report telephone hours as clinic opening hours.

### Services

Only report services supported by source evidence.

Do not infer services from the clinic name.

### Dental Subsidy

Be conservative.

A clinic mentioning dental treatment does not prove participation in a state dental subsidy program.

Only mark subsidy participation as confirmed when the source provides appropriate evidence.

### Booking URL

Only report an actual online booking URL.

Do not invent URLs such as:

```text
/booking
/book
/boka
```

unless the source explicitly supports the URL.

Do not treat `tel:`, `mailto:`, Facebook, or Instagram URLs as booking URLs.

---

## 9. Swedish Data

The pipeline processes Swedish data.

Preserve:

```text
å
ä
ö
```

in displayed data.

Normalization may remove diacritics only when necessary for:

* comparison
* searching
* stable identifiers

Do not replace the original source value with the normalized value.

---

## 10. Conflict Resolution

Conflict detection must be field-aware.

Examples:

* phone → normalized phone comparison
* email → normalized email comparison
* organization number → normalized organization number comparison
* booking URL → normalized URL comparison
* address → normalized address comparison
* services → set comparison
* opening hours → structured comparison

Do not compare all fields using generic JSON equality.

Source priority may differ by field.

Document important priority decisions in:

`DECISIONS.md`

---

## 11. Stable IDs

Clinic IDs must not depend on CSV row position.

The seed file may be reordered.

Use a deterministic identity based on stable clinic information, such as:

```text
clinic-name--city
```

Handle duplicate IDs deterministically.

---

## 12. Testing

Every meaningful extraction or normalization rule should have tests.

Prefer deterministic fixtures over live websites.

Tests should cover:

* valid input
* missing values
* malformed values
* multiple formats
* normalization
* conflicts
* source failures
* resolver behavior

Use Vitest.

Before considering a change complete, run:

```bash
npm test
npm run build
```

Never claim tests pass unless they were actually run.

---

## 13. Development Workflow

Work incrementally.

For each requested phase:

1. Inspect the existing code.
2. Understand the current implementation.
3. Identify the smallest required change.
4. Implement only that change.
5. Run tests.
6. Run the build.
7. Review the Git diff.
8. Update documentation if necessary.
9. Report the result.
10. Wait for the next instruction.

Do not implement future phases without being asked.

Do not rewrite working code without a clear reason.

---

## 14. Scope Control

This assessment intentionally has a large scope.

Prioritize:

1. correctness
2. evidence traceability
3. reproducibility
4. evaluation
5. robustness
6. maintainability

Do not add unnecessary infrastructure.

Do not introduce:

* databases
* Redis
* message queues
* microservices
* Kubernetes
* frontend frameworks
* authentication systems
* cloud infrastructure

unless a real project requirement requires them.

A CLI/data pipeline is sufficient.

---

## 15. Documentation

Maintain these documents:

### README.md

Contains:

* project purpose
* setup
* commands
* architecture
* input
* output
* limitations

### DECISIONS.md

Record important engineering decisions and scope cuts.

Examples:

* why a source was selected
* why a source was excluded
* why source priority changed
* why a crawler limit was chosen
* why a field remains unresolved

### QUESTIONS.md

Record:

* questions for the recruiter
* assumptions that do not require a question

Respect the assessment limit on recruiter questions.

### DATA-SOURCES.md

Track:

* source
* purpose
* access status
* robots status
* limitations
* extraction status

### EVALUATION.md

Track:

* gold-set methodology
* matching rules
* precision
* recall
* failures
* limitations

---

## 16. Git

Git history is part of the assessment.

Make small, meaningful commits.

Do not create one large final commit.

Commit only completed logical changes.

Use clear commit messages such as:

```text
feat: add seed CSV ingestion
feat: define public source extraction contract
feat: add Swedish clinic data normalization
feat: add deterministic clinic field extractors
feat: add robots-aware polite HTTP fetching
feat: add clinic website source extraction
feat: add 1177 source extraction
feat: add evidence resolution and conflict detection
test: add extractor and resolver coverage
docs: document pipeline decisions and limitations
```

Do not fabricate commits.

Do not manipulate commit timestamps.

Do not rewrite history unless explicitly requested.

---

## 17. Security

Never commit:

* API keys
* passwords
* credentials
* tokens
* private data

Use environment variables when secrets are genuinely required.

Review changes before committing.

---

## 18. AI Agent Rules

The agent must not implement the whole project automatically.

When the user requests a phase, work only on that phase.

Before major implementation, briefly state:

```text
Files to change:
Why:
Expected behavior:
```

After implementation, report:

```text
Changed:
Tests:
Build:
Documentation:
Next recommended phase:
```

Do not silently continue to the next phase.

Do not invent requirements that are not in the assessment or project documentation.

If a requirement is ambiguous:

1. inspect existing documentation
2. inspect existing code
3. make the smallest reasonable assumption
4. record the assumption in `QUESTIONS.md` or `DECISIONS.md` when appropriate

---

## 19. Important Quality Rule

Prefer a smaller reliable implementation over a larger unreliable scraper.

The reviewer should be able to understand:

* where a value came from
* why it was selected
* when sources disagreed
* what failed
* what remains unresolved
* how accuracy was measured
* what trade-offs were made

The pipeline must be honest about uncertainty.

---

## 20. Final Principle

Build the system around this rule:

```text
Evidence
    >
Coverage

Correctness
    >
Complexity

Reproducibility
    >
One-off manual work
```

Never sacrifice evidence quality merely to increase the number of populated fields.
