import glossary from 'i18n/contentGlossary.json';

interface GlossaryFile {
  phrases: Record<string, string>;
  prefixes: Record<string, string>;
  suffixes: Record<string, string>;
  separators: string[];
}

const CONTENT_GLOSSARY = glossary as GlossaryFile;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic translation for seeded/composed values (section names, shelf names,
 * storage locations, position markers).
 * Returns null when the glossary has no translation for the given text.
 */
export function translateWithGlossary(value: string, depth = 0): string | null {
  const text = value.trim();
  if (!text) return null;

  const exact = CONTENT_GLOSSARY.phrases[text];
  if (exact) return exact;

  // Case-insensitive exact match; the stored value keeps its own casing.
  const lower = text.toLowerCase();
  for (const [source, target] of Object.entries(CONTENT_GLOSSARY.phrases)) {
    if (source.toLowerCase() === lower) return target;
  }

  // Storage locations are composed at write time ("Central Record Room — Locker 4").
  if (depth < 2) {
    for (const separator of CONTENT_GLOSSARY.separators) {
      if (!text.includes(separator)) continue;
      const parts = text.split(separator);
      if (parts.length < 2) continue;
      const translatedParts = parts.map((part) => {
        const trimmed = part.trim();
        return translateWithGlossary(trimmed, depth + 1) ?? trimmed;
      });
      return translatedParts.join(separator);
    }

    for (const [prefix, target] of Object.entries(CONTENT_GLOSSARY.prefixes)) {
      const match = text.match(new RegExp(`^${escapeRegExp(prefix)}\\s+(.+)$`, 'i'));
      if (match) {
        const rest = match[1].trim();
        const restTranslated = translateWithGlossary(rest, depth + 1) ?? rest;
        return `${target} ${restTranslated}`;
      }
    }

    for (const [suffix, target] of Object.entries(CONTENT_GLOSSARY.suffixes)) {
      const match = text.match(new RegExp(`^(.+?)\\s+${escapeRegExp(suffix)}$`, 'i'));
      if (match) {
        const rest = match[1].trim();
        const restTranslated = translateWithGlossary(rest, depth + 1) ?? rest;
        return `${target} ${restTranslated}`;
      }
    }
  }

  return null;
}
