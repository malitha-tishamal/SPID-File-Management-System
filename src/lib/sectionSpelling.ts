'use client';

/**
 * Lazy client-side spell checking for the Section Name field.
 *
 * The Hunspell dictionary is fetched from `/public/dictionaries` only after the
 * user first types in a section name, so it never ships in the main JS bundle.
 * nspell accepts the raw `.aff`/`.dic` text directly.
 */

export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): void;
}

let loader: Promise<SpellChecker | null> | null = null;

export function loadSpellChecker(): Promise<SpellChecker | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!loader) {
    loader = (async () => {
      const [nspellModule, affResponse, dicResponse] = await Promise.all([
        import('nspell'),
        fetch('/dictionaries/en.aff', { cache: 'force-cache' }),
        fetch('/dictionaries/en.dic', { cache: 'force-cache' }),
      ]);
      if (!affResponse.ok || !dicResponse.ok) return null;
      const [aff, dic] = await Promise.all([affResponse.text(), dicResponse.text()]);
      const nspell = (nspellModule as { default?: unknown }).default ?? nspellModule;
      if (typeof nspell !== 'function') return null;
      return (nspell as (aff: string, dic: string) => SpellChecker)(aff, dic);
    })().catch(() => null);
  }
  return loader;
}

/** Adds every alphabetic word (and its lowercase form) to the checker. */
export function addDictionaryWords(spell: SpellChecker, text: string | readonly string[]) {
  const source = Array.isArray(text) ? text : [text as string];
  const seen = new Set<string>();
  for (const chunk of source) {
    const words = String(chunk ?? '').match(/[\p{L}][\p{L}'’]*/gu) ?? [];
    for (const word of words) {
      const clean = word.replace(/^['’]+|['’]+$/g, '');
      if (clean.length < 2) continue;
      for (const form of [clean, clean.toLowerCase()]) {
        if (seen.has(form)) continue;
        seen.add(form);
        try {
          spell.add(form);
        } catch {
          // Ignore words the dictionary refuses (punctuation, very short).
        }
      }
    }
  }
}

export interface WordToken {
  text: string;
  start: number;
  end: number;
}

export function tokenizeWords(value: string): WordToken[] {
  const tokens: WordToken[] = [];
  const pattern = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

export interface SpellingIssue {
  token: WordToken;
  suggestions: string[];
}

export function collectSpellingIssues(
  spell: SpellChecker,
  value: string,
  suggestionLimit = 3,
): SpellingIssue[] {
  const issues: SpellingIssue[] = [];
  for (const token of tokenizeWords(value)) {
    if (token.text.length < 3) continue;
    if (spell.correct(token.text)) continue;
    let suggestions: string[] = [];
    try {
      suggestions = spell.suggest(token.text).slice(0, suggestionLimit);
    } catch {
      suggestions = [];
    }
    issues.push({ token, suggestions });
  }
  return issues;
}

export function levenshteinDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[right.length];
}

/**
 * Returns an autocorrect candidate only when the word has exactly one
 * suggestion at edit distance 1 (high confidence). Anything ambiguous is left
 * to the suggestion chips so the user decides.
 */
export function pickHighConfidenceSuggestion(
  word: string,
  suggestions: readonly string[],
): string | null {
  const close = suggestions.filter((suggestion) => levenshteinDistance(word, suggestion) === 1);
  return close.length === 1 ? close[0] : null;
}

export function replaceToken(value: string, token: WordToken, replacement: string): string {
  return `${value.slice(0, token.start)}${replacement}${value.slice(token.end)}`;
}

/** Finds the word the caret is inside or immediately after. */
export function wordAtCaret(value: string, caret: number): WordToken | null {
  const tokens = tokenizeWords(value);
  let lastBefore: WordToken | null = null;
  for (const token of tokens) {
    if (caret >= token.start && caret <= token.end) return token;
    if (token.end <= caret) lastBefore = token;
    if (token.start > caret) break;
  }
  return lastBefore;
}

/** Replaces every misspelled word with its top suggestion. */
export function applyAllSuggestions(value: string, issues: readonly SpellingIssue[]): string {
  let next = value;
  for (const issue of [...issues].sort((a, b) => b.token.start - a.token.start)) {
    const top = issue.suggestions[0];
    if (!top) continue;
    next = replaceToken(next, issue.token, top);
  }
  return next;
}
