# Questions and assumptions

## Open questions

1. **Organization numbers** — is the organization number expected to be
   verified against an authoritative company registry, or is a matching value
   from a clinic website / 1177 acceptable when the registry is unavailable?

2. **State dental subsidy** — what should count as sufficient evidence for
   "connected to the state dental subsidy"? For example, should an explicit
   reference to Försäkringskassan or ATB/STB be required, or is being an
   authorized dental-care provider enough?

3. **Booking URLs** — should a booking field contain only a direct booking
   URL, or is a clinic contact page acceptable when that page is where the
   booking flow starts?

4. **Source freshness** — when sources disagree, how important is recency
   compared with source authority? For example, should a newer 1177 value
   override an older value from the clinic website?

5. **Manual review** — is the intended production workflow fully automated,
    or is a small manual-review queue for low-confidence or conflicting
    records acceptable? If manual review is acceptable, I would prioritize
    conflicts and high-value missing fields rather than forcing a guess.