//This file is your output/reporting layer. It does three main things:
// ResolvedClinic[]
//       │
//       ├── buildQualityReport()
//       │       ↓
//       │   quality-report.json
//       │
//       ├── buildRunReport()
//       │       ↓
//       │   run-report.json
//       │
//       └── writeOutputs()
//               ↓
//           clinics.json
// It doesn't scrape or resolve data. It takes the already-resolved results and summarizes/writes them.

import { mkdirSync, writeFileSync } from "node:fs";
import type { ResolvedClinic } from "../model/types.js";

export interface QualityReportField {
  field: string;
  resolvedCount: number;
  nullCount: number;
  conflictCount: number;
  averageConfidence: number;
}

export interface QualityReport {
  totalClinics: number;
  perField: QualityReportField[];
  totalConflicts: number;
  clinicsWithAnyConflict: number;
}

export interface RunReport {
  runAt: string;
  totalClinics: number;
  totalSourcesChecked: number;
  totalSourcesSkipped: number;
  skippedByReason: Record<string, number>;
  clinicsWithProcessingErrors: number;
}

const FIELD_NAMES = [
  "canonicalName",
  "orgNumber",
  "visitingAddress",
  "phone",
  "email",
  "openingHours",
  "services",
  "dentalSubsidy",
  "bookingUrl",
] as const;

export function buildQualityReport(clinics: ResolvedClinic[]): QualityReport {
  const perField: QualityReportField[] = FIELD_NAMES.map((field) => {
    let resolvedCount = 0;
    let nullCount = 0;
    let conflictCount = 0;
    let confidenceSum = 0;

    for (const clinic of clinics) {
      const f = clinic.fields[field];
      const isNull = f.value === null || (field === "dentalSubsidy" && (f.value as { status: string }).status === "unknown");
      if (isNull) nullCount++;
      else resolvedCount++;
      if (f.conflict) conflictCount++;
      confidenceSum += f.confidence;
    }

    return {
      field,
      resolvedCount,
      nullCount,
      conflictCount,
      averageConfidence: clinics.length > 0 ? Number((confidenceSum / clinics.length).toFixed(3)) : 0,
    };
  });

  const clinicsWithAnyConflict = clinics.filter((c) => FIELD_NAMES.some((f) => c.fields[f].conflict)).length;

  return {
    totalClinics: clinics.length,
    perField,
    totalConflicts: perField.reduce((sum, f) => sum + f.conflictCount, 0),
    clinicsWithAnyConflict,
  };
}

export function buildRunReport(clinics: ResolvedClinic[]): RunReport {
  const skippedByReason: Record<string, number> = {};
  let totalSkipped = 0;
  let totalChecked = 0;
  let withErrors = 0;

  for (const clinic of clinics) {
    totalChecked += clinic.sourcesChecked.length;
    totalSkipped += clinic.sourcesSkipped.length;
    if (clinic.processingErrors.length > 0) withErrors++;
    for (const skip of clinic.sourcesSkipped) {
      skippedByReason[skip.reason] = (skippedByReason[skip.reason] ?? 0) + 1;
    }
  }

  return {
    runAt: new Date().toISOString(),
    totalClinics: clinics.length,
    totalSourcesChecked: totalChecked,
    totalSourcesSkipped: totalSkipped,
    skippedByReason,
    clinicsWithProcessingErrors: withErrors,
  };
}

export function writeOutputs(outputDir: string, clinics: ResolvedClinic[]): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(`${outputDir}/clinics.json`, JSON.stringify(clinics, null, 2), "utf8");
  writeFileSync(`${outputDir}/quality-report.json`, JSON.stringify(buildQualityReport(clinics), null, 2), "utf8");
  writeFileSync(`${outputDir}/run-report.json`, JSON.stringify(buildRunReport(clinics), null, 2), "utf8");
}