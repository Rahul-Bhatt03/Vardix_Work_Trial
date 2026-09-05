// Hand-labelled gold-set record shape. One of these per gold clinic,
// hand-verified by a human against the clinic's actual public sources —
// not copied from pipeline output.
//
// Null-handling rule (documented here because the brief requires it to be
// explicit): a null value means "I checked and verified this field is
// genuinely not published/available for this clinic" — NOT "I didn't
// check". Every field on every gold clinic must be deliberately labelled
// one way or the other; there is no third "unchecked" state in this file
// format. If a labeller has not actually checked a field, the clinic
// should not be in the gold set yet.

export type GoldOpeningHours = Partial<
  Record<1 | 2 | 3 | 4 | 5 | 6 | 7, { opens: string; closes: string }[]>
>;

export interface GoldClinic {
  clinicId: string; // must match the SeedClinic.id this row corresponds to
  clinicName: string; // for human readability when scanning the file; not used in scoring
  canonicalName: string | null;
  orgNumber: string | null; // normalized NNNNNN-NNNN
  visitingAddress: { postalCode: string; city: string } | null;
  phone: string | null; // normalized +46...
  email: string | null;
  openingHours: GoldOpeningHours | null;
  services: string[] | null; // canonical service names, from the same vocabulary as src/extract/services.ts where possible
  dentalSubsidy: "confirmed" | "not_found" | "conflicting" | "unknown" | null;
  bookingUrl: string | null;
  /** How/where the labeller verified this row. Required — an unlabelled source is not a real gold row. */
  labelledFrom: string;
  labelledAt: string;
  notes?: string;
}