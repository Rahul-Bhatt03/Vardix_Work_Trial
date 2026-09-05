// This file answers “For one clinic, how do I combine evidence from all sources and produce the final value for every required field?”

import type {
  AddressValue,
  DentalSubsidyValue,
  FieldEvidence,
  FieldName,
  OpeningHoursValue,
  ResolvedClinicFields,
} from "../model/types.js";
import type { RawEvidence } from "../sources/types.js";
import { addressEquals, openingHoursEquals, organizationNumberEquals, phoneEquals, servicesEquals, stringEquals, urlEquals } from "./equality.js";
import { resolveField } from "./resolver.js";
import { resolveDentalSubsidy } from "./subsidy.js";

function collect<T>(rawEvidenceList: RawEvidence[], field: FieldName): FieldEvidence<T>[] {
  const out: FieldEvidence<T>[] = [];
  for (const raw of rawEvidenceList) {
    const items = raw[field] as FieldEvidence<T>[] | undefined;
    if (items) out.push(...items);
  }
  return out;
}

/**
 * Merges every source's raw evidence for one clinic into the final
 * resolved field set. This is the one place in the pipeline where
 * cross-source conflict is decided — sources themselves never see each
 * other's output.
 */
export function resolveClinicFields(rawEvidenceList: RawEvidence[]): ResolvedClinicFields {
  return {
    canonicalName: resolveField(collect<string>(rawEvidenceList, "canonicalName"), { equals: stringEquals }),
    orgNumber: resolveField(collect<string>(rawEvidenceList, "orgNumber"), { equals: organizationNumberEquals }),
    visitingAddress: resolveField<AddressValue>(collect(rawEvidenceList, "visitingAddress"), {
      equals: addressEquals,
      describe: (v) => v.raw,
    }),
    phone: resolveField(collect<string>(rawEvidenceList, "phone"), { equals: phoneEquals }),
    email: resolveField(collect<string>(rawEvidenceList, "email"), { equals: stringEquals }),
    openingHours: resolveField<OpeningHoursValue>(collect(rawEvidenceList, "openingHours"), {
      equals: openingHoursEquals,
      describe: (v) => JSON.stringify(v.byWeekday),
    }),
    services: resolveField<string[]>(collect(rawEvidenceList, "services"), {
      equals: servicesEquals,
      describe: (v) => v.join(", "),
    }),
    dentalSubsidy: resolveDentalSubsidy(collect<DentalSubsidyValue>(rawEvidenceList, "dentalSubsidy")),
    bookingUrl: resolveField(collect<string>(rawEvidenceList, "bookingUrl"), { equals: urlEquals }),
  };
}