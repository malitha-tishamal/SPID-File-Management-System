'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SectionNameLike } from 'lib/sectionName';
import {
  addDictionaryWords,
  applyAllSuggestions,
  collectSpellingIssues,
  loadSpellChecker,
  pickHighConfidenceSuggestion,
  replaceToken,
  tokenizeWords,
  wordAtCaret,
  type SpellChecker,
  type SpellingIssue,
} from 'lib/sectionSpelling';

const WAVY_STYLE: React.CSSProperties = {
  textDecorationLine: 'underline',
  textDecorationStyle: 'wavy',
  textDecorationColor: '#ef4444',
  textDecorationSkipInk: 'none',
  textUnderlineOffset: '3px',
};

interface SpellCheckedNameInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** All sections, used as a custom dictionary so real names are not flagged. */
  sections?: readonly SectionNameLike[];
  /** Extra dictionary text (e.g. the Section Lead field). */
  extraDictionaryText?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  invalid?: boolean;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  /** Classes for the bordered field shell (background, border, radius, font size). */
  fieldClassName?: string;
  /** Padding shared by the visible text layer and the real input. */
  paddingClassName?: string;
}

function safeSuggest(spell: SpellChecker, word: string): string[] {
  try {
    return spell.suggest(word).slice(0, 3);
  } catch {
    return [];
  }
}

export default function SpellCheckedNameInput({
  id,
  value,
  onChange,
  sections = [],
  extraDictionaryText = '',
  placeholder,
  disabled = false,
  autoFocus = false,
  maxLength,
  invalid = false,
  ariaDescribedBy,
  ariaLabel,
  fieldClassName = '',
  paddingClassName = 'px-3.5 py-2.5',
}: SpellCheckedNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const undoRef = useRef<{ previous: string; corrected: string } | null>(null);

  const [spell, setSpell] = useState<SpellChecker | null>(null);
  const [wantsSpelling, setWantsSpelling] = useState(false);
  const [caret, setCaret] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const sectionsKey = useMemo(() => sections.map((section) => section.name).join('|'), [sections]);

  useEffect(() => {
    // Stay completely inert until the user interacts with the field: the
    // ~550KB dictionary must never be fetched just because a modal opened.
    if (!wantsSpelling) return;
    let cancelled = false;
    loadSpellChecker().then((checker) => {
      if (!checker || cancelled) return;
      addDictionaryWords(checker, sectionsKey.split('|').filter(Boolean));
      addDictionaryWords(checker, extraDictionaryText);
      setSpell(checker);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsSpelling, sectionsKey, extraDictionaryText]);

  const issues: SpellingIssue[] = useMemo(
    () => (spell && value ? collectSpellingIssues(spell, value) : []),
    [spell, value],
  );

  const misspelledKeys = useMemo(
    () => new Set(issues.map((issue) => `${issue.token.start}-${issue.token.end}`)),
    [issues],
  );

  const activeIssue = useMemo(() => {
    if (!issues.length) return null;
    const activeToken = wordAtCaret(value, caret);
    if (activeToken) {
      const underCaret = issues.find(
        (issue) => issue.token.start === activeToken.start && issue.token.end === activeToken.end,
      );
      if (underCaret) return underCaret;
    }
    return issues[0];
  }, [issues, value, caret]);

  useEffect(() => {
    if (pendingCaretRef.current !== null) {
      const position = pendingCaretRef.current;
      pendingCaretRef.current = null;
      inputRef.current?.setSelectionRange(position, position);
      setCaret(position);
    }
  }, [value]);

  const commit = useCallback(
    (nextValue: string, nextCaret?: number) => {
      if (nextCaret !== undefined) pendingCaretRef.current = nextCaret;
      onChange(nextValue);
    },
    [onChange],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    undoRef.current = null;
    setWantsSpelling(true);
    onChange(event.target.value);
    setCaret(event.target.selectionStart ?? event.target.value.length);
    setScrollLeft(event.target.scrollLeft);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const undo = undoRef.current;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && undo) {
      event.preventDefault();
      undoRef.current = null;
      commit(undo.previous);

      return;
    }
    if (event.key === 'Backspace' && undo && value === undo.corrected) {
      event.preventDefault();
      undoRef.current = null;
      commit(undo.previous);

      return;
    }
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (!spell) return;

    const position = inputRef.current?.selectionStart ?? value.length;
    const token = wordAtCaret(value, position);
    if (!token || token.text.length < 3 || spell.correct(token.text)) return;

    const correction = pickHighConfidenceSuggestion(token.text, safeSuggest(spell, token.text));
    if (!correction) return;

    event.preventDefault();
    const replaced = replaceToken(value, token, correction);
    const withSpace = event.key === ' ' ? `${replaced} ` : replaced;
    undoRef.current = { previous: value, corrected: withSpace };
    commit(withSpace, token.start + correction.length + (event.key === ' ' ? 1 : 0));
  };

  const applySuggestion = (issue: SpellingIssue, suggestion: string) => {
    undoRef.current = null;
    commit(replaceToken(value, issue.token, suggestion), issue.token.start + suggestion.length);
  };

  const applyAll = () => {
    undoRef.current = null;
    const corrected = applyAllSuggestions(value, issues);
    commit(corrected, corrected.length);
  };

  const tokens = useMemo(() => tokenizeWords(value), [value]);
  const overlay: React.ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const key = `${token.start}-${token.end}`;
    if (!misspelledKeys.has(key)) continue;
    if (cursor < token.start) overlay.push(value.slice(cursor, token.start));
    overlay.push(
      <span key={key} style={WAVY_STYLE}>
        {value.slice(token.start, token.end)}
      </span>,
    );
    cursor = token.end;
  }
  if (cursor < value.length) overlay.push(value.slice(cursor));

  const suggestionsId = id ? `${id}-spelling-suggestions` : undefined;
  const describedBy = [ariaDescribedBy, suggestionsId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <div
        className={`relative overflow-hidden transition-colors ${fieldClassName} ${
          invalid ? 'border-red-500' : ''
        }`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre ${paddingClassName}`}
        >
          <div
            ref={overlayRef}
            className="text-slate-800 dark:text-white"
            style={{ transform: `translateX(-${scrollLeft}px)` }}
          >
            {overlay}
          </div>
        </div>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          spellCheck
          autoCorrect="on"
          autoCapitalize="words"
          lang="en"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          className={`relative w-full bg-transparent text-transparent caret-[#4318FF] outline-none placeholder:text-slate-400 dark:caret-brand-300 ${paddingClassName}`}
        />
      </div>

      {activeIssue && activeIssue.suggestions.length > 0 && (
        <div
          id={suggestionsId}
          className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <span className="font-semibold">Did you mean:</span>
          {activeIssue.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => applySuggestion(activeIssue, suggestion)}
              className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-navy-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {suggestion}
            </button>
          ))}
          {issues.length > 1 && (
            <button
              type="button"
              disabled={disabled}
              onClick={applyAll}
              className="ml-auto font-bold text-[#4318FF] underline-offset-2 hover:underline disabled:opacity-50 dark:text-brand-300"
            >
              Apply all corrections
            </button>
          )}
        </div>
      )}
    </div>
  );
}
