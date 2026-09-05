# Evaluation

## Baseline

The previous 300-clinic run reported 269/300 canonical names, 27/300 organization numbers, 145/300 addresses, 244/300 phones, 181/300 emails, 49/300 opening-hours schedules, 218/300 services, 45/300 subsidy results, and 153/300 booking URLs. It reported 136 clinics with at least one conflict. The earlier gold report matched 3 of 8 clinics.

## Identity diagnosis

The 3/8 result was caused by exact `clinicId` lookup against IDs generated from the current seed row name and city. Several gold IDs represented a shorter display name or appended the city differently than the seed row. Examples included A-Dental versus the seed's provider-qualified name, Abbas Dental AB versus Abbas Dental Klinik, and City Dental/D-dental IDs that included the city in the name. The seed ID itself remained stable through ingestion, pipeline processing, resolution, and output; resolved names did not regenerate it.

Gold matching now uses this general hierarchy: preserved seed ID, normalized organization number, unique labelled-source website domain, and a unique normalized name plus city match. The report records the selected method and details in `identityDiagnostics`. The current gold file contains 26 rows, including duplicate clinic IDs and both string- and array-valued `labelledFrom` records; those shapes are handled without changing the labels.

## Current validation

- `npm test`: 120 tests passed.
- `npm run build`: passed.
- Gold identity evaluation: 26/26 rows matched in the current gold file.
- The current field metrics are written to `output/eval-report.json` after each `npm run eval`.
- A full 300-clinic rerun was attempted with bounded relevant website-page discovery. It reached the first clinics, but the restricted network environment made the network-backed run impractical to finish; the previous completed 300-clinic report remains in `output/quality-report.json` until a network-capable run is performed.

## Remaining risk

The largest remaining accuracy risks are sparse organization-number and opening-hours coverage, source disagreement on canonical names and phones, and incomplete website-specific extraction. Gold rows with duplicate clinic IDs should be reviewed as a data-quality issue, but were not modified by the pipeline.
