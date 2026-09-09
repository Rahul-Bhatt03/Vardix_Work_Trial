export interface FreeCareMatch {
  value: boolean;
  matchedText: string;
}

const POSITIVE_PATTERNS = [
  /fri\s+tandvård\s+för\s+barn\s+och\s+unga/i,
  /fri\s+barntandvård/i,
  /gratis\s+barntandvård/i,
  /barntandvård[^.!?\n]{0,80}(?:gratis|kostnadsfri|kostnadsfritt)/i,
  /(?:barn|unga)[^.!?\n]{0,80}(?:går|får)\s+gratis/i,
  /(?:0\s*[-–]\s*19|under\s+19|till\s+och\s+med\s+19)\s*(?:år|åringar)?[^.!?\n]{0,80}(?:gratis|fri|kostnadsfri)/i,
];

const NEGATIVE_PATTERNS = [
  /(?:ingen|inte|ej)\s+(?:fri|gratis|kostnadsfri)\s+(?:tandvård|barntandvård)/i,
  /(?:endast|enbart)\s+vuxen(?:tandvård|patienter)/i,
  /tar\s+inte\s+emot\s+barn/i,
];

/** Finds explicit claims about free dental care for patients under 19. */
export function detectFreeCareUnder19(text: string): FreeCareMatch[] {
  const matches: FreeCareMatch[] = [];

  for (const pattern of NEGATIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) matches.push({ value: false, matchedText: match[0] });
  }

  for (const pattern of POSITIVE_PATTERNS) {
    const match = text.match(pattern);
    if (match) matches.push({ value: true, matchedText: match[0] });
  }

  return matches;
}