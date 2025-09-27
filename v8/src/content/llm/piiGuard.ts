export interface PlaceholderMatch {
  token: string;
  value: string;
}

export interface MaskResult {
  sanitized: string;
  matches: PlaceholderMatch[];
  mapping: Map<string, string>;
}

interface InternalMatch {
  index: number;
  length: number;
  value: string;
  type: string;
}

interface Heuristic {
  type: string;
  pattern: RegExp;
  filter?: (match: RegExpMatchArray) => boolean;
}

const HEURISTICS: Heuristic[] = [
  {
    type: 'EMAIL',
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  },
  {
    type: 'PHONE',
    pattern: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    filter: (match) => match[0].replace(/\D/g, '').length >= 7
  },
  {
    type: 'CARD',
    pattern: /(?:\d[ -]?){13,19}/g,
    filter: (match) => {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) {
        return false;
      }
      // Luhn check to reduce false positives.
      let sum = 0;
      let shouldDouble = false;
      for (let i = digits.length - 1; i >= 0; i -= 1) {
        let digit = parseInt(digits.charAt(i), 10);
        if (shouldDouble) {
          digit *= 2;
          if (digit > 9) {
            digit -= 9;
          }
        }
        sum += digit;
        shouldDouble = !shouldDouble;
      }
      return sum % 10 === 0;
    }
  },
  {
    type: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g
  },
  {
    type: 'IP',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g
  },
  {
    type: 'UUID',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  },
  {
    type: 'GEO',
    pattern: /\b\d{1,4}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?:\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Boulevard|Blvd\.|Lane|Ln\.|Drive|Dr\.))\b/g
  }
];

function overlaps(existing: InternalMatch[], start: number, end: number) {
  return existing.some((match) => {
    const matchEnd = match.index + match.length;
    return (start >= match.index && start < matchEnd) || (match.index >= start && match.index < end);
  });
}

function collectMatches(text: string) {
  const matches: InternalMatch[] = [];

  for (const heuristic of HEURISTICS) {
    heuristic.pattern.lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = heuristic.pattern.exec(text)) !== null) {
      const value = result[0];
      if (!value) {
        continue;
      }
      if (heuristic.filter && !heuristic.filter(result)) {
        continue;
      }
      const index = result.index;
      const length = value.length;
      if (overlaps(matches, index, index + length)) {
        continue;
      }
      matches.push({ index, length, value, type: heuristic.type });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function buildTokens(matches: InternalMatch[], text: string): MaskResult {
  const buckets = new Map<string, number>();
  const pieces: string[] = [];
  const replacements: PlaceholderMatch[] = [];
  const mapping = new Map<string, string>();

  let cursor = 0;

  for (const match of matches) {
    const count = (buckets.get(match.type) ?? 0) + 1;
    buckets.set(match.type, count);
    const token = `[[PII-${match.type}-${count}]]`;

    pieces.push(text.slice(cursor, match.index));
    pieces.push(token);
    cursor = match.index + match.length;

    replacements.push({ token, value: match.value });
    mapping.set(token, match.value);
  }

  pieces.push(text.slice(cursor));

  return {
    sanitized: pieces.join(''),
    matches: replacements,
    mapping
  };
}

export function maskText(text: string): MaskResult {
  if (!text) {
    return {
      sanitized: text,
      matches: [],
      mapping: new Map()
    };
  }

  const matches = collectMatches(text);
  return buildTokens(matches, text);
}

export function scanText(text: string): PlaceholderMatch[] {
  return maskText(text).matches;
}

export function rehydrateText(text: string, matches: PlaceholderMatch[]): string {
  if (!matches.length) {
    return text;
  }

  let output = text;
  for (const match of matches) {
    output = output.replace(match.token, match.value);
  }
  return output;
}
