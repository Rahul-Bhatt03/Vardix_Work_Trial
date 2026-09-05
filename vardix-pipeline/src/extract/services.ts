// Finds known dental/skin services from clinic text using predefined Swedish terms,
// converts them to standard service names, and keeps matching text as evidence.
// It never guesses services. An LLM extractor can be used separately for unstructured text.

export interface ServiceVocabularyEntry {
  canonical: string;
  variants: RegExp[];
}
 
const TANDVARD_VOCAB: ServiceVocabularyEntry[] = [
  { canonical: "Allmän tandvård", variants: [/allmän\s*(?:tand)?vård/i, /allmäntandvård/i] },
  { canonical: "Akut tandvård", variants: [/akuttandvård/i, /akut\s+tandvård/i, /akuta\s+besvär/i] },
  { canonical: "Implantat", variants: [/implantat/i, /tandimplantat/i] },
  { canonical: "Tandreglering", variants: [/tandreglering/i, /ortodonti/i, /tandställning/i] },
  { canonical: "Estetisk tandvård", variants: [/estetisk\s+tandvård/i, /kosmetisk\s+tandvård/i, /tandblekning/i] },
  { canonical: "Barn- och ungdomstandvård", variants: [/barn-?\s*och\s*ungdomstandvård/i, /barntandvård/i] },
  { canonical: "Protetik", variants: [/protetik/i, /tandprotes/i, /brygg(?:a|or)/i] },
  { canonical: "Rotfyllning", variants: [/rotfyllning/i, /rotbehandling/i, /endodonti/i] },
  { canonical: "Parodontologi", variants: [/parodontologi/i, /tandlossning/i, /parodontit/i] },
  { canonical: "Käkkirurgi", variants: [/käkkirurgi/i, /visdomstand/i, /oral\s?kirurgi/i] },
  { canonical: "Sedering/Narkos", variants: [/sedering/i, /lustgas/i, /narkos/i, /tandvårdsrädsla/i] },
  { canonical: "Hygienist", variants: [/tandhygienist/i] },
];
 
const HUD_VOCAB: ServiceVocabularyEntry[] = [
  { canonical: "Hudcancerkontroll", variants: [/hudcancer/i, /modermärkeskontroll/i, /melanom/i] },
  { canonical: "Akne-behandling", variants: [/akne/i] },
  { canonical: "Eksem/psoriasis", variants: [/eksem/i, /psoriasis/i, /atopisk\s+dermatit/i] },
  { canonical: "Laserbehandling", variants: [/laserbehandling/i, /hårborttagning/i] },
  { canonical: "Estetisk hudvård", variants: [/estetisk\s+hudvård/i, /fillers?/i, /botox/i, /rynkbehandling/i] },
  { canonical: "Allergiutredning", variants: [/allergitest/i, /allergiutredning/i] },
  { canonical: "Kirurgiskt hudingrepp", variants: [/hudkirurgi/i, /borttagning\s+av\s+(?:hudförändring|vårta)/i] },
];
 
export function matchServices(text: string, segment: string): { canonical: string; evidenceText: string }[] {
  const vocab = segment === "hud" ? HUD_VOCAB : segment === "tandvard" ? TANDVARD_VOCAB : [...TANDVARD_VOCAB, ...HUD_VOCAB];
  const found = new Map<string, string>();
 
  for (const entry of vocab) {
    for (const variant of entry.variants) {
      const m = text.match(variant);
      if (m) {
        if (!found.has(entry.canonical)) {
          const start = Math.max(0, (m.index ?? 0) - 20);
          const end = Math.min(text.length, (m.index ?? 0) + m[0].length + 20);
          found.set(entry.canonical, text.slice(start, end).trim());
        }
        break;
      }
    }
  }
 
  return Array.from(found.entries()).map(([canonical, evidenceText]) => ({ canonical, evidenceText }));
}