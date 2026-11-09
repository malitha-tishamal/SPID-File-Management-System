'use client';

import React, { useEffect, useState } from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';
import { capitalizeFirstLetter, type SectionOption } from 'utils/fileImport';
import { fetchClientSections } from 'lib/sectionsClient';
import type { SectionNameLike } from 'lib/sectionName';
import {
  normalizeSectionName,
  SECTION_NAME_MAX_LENGTH,
  SECTION_NAME_MIN_LENGTH,
} from 'lib/sectionName';
import { useSectionNameCheck } from 'lib/useSectionNameCheck';
import { useTranslation } from 'react-i18next';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import SpellCheckedNameInput from 'components/ui/SpellCheckedNameInput';

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (section: SectionOption) => void;
}

const FIELD_SHELL =
  'w-full rounded-xl bg-[#F4F7FE] dark:bg-navy-900 text-xs font-medium border border-transparent focus-within:border-[#4318FF]';

export default function AddSectionModal({
  isOpen,
  onClose,
  onCreated,
}: AddSectionModalProps) {
  const { t } = useTranslation('accounts');
  const [name, setName] = useState('');
  const [sectionLead, setSectionLead] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [allSections, setAllSections] = useState<SectionNameLike[]>([]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSectionLead('');
      setError(null);
      setSaving(false);

      // Duplicate checks must cover disabled sections too, so fetch the full
      // list instead of relying on the active-only dropdown data.
      fetchClientSections()
        .then((sections) => {
          if (Array.isArray(sections)) setAllSections(sections as SectionNameLike[]);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const duplicateCheck = useSectionNameCheck({
    name,
    sections: allSections,
    enabled: isOpen,
  });
  const duplicateMessage = duplicateCheck.message;

  /**
   * Handle section name change with automatic first-letter capitalization (Requirement 5).
   * Capitalizes only the first letter of the name, preserving the rest of the text.
   */
  const handleNameChange = (val: string) => {
    setError(null);
    if (!val) {
      setName('');
      return;
    }
    // Unicode-safe first letter capitalization as user types
    const chars = Array.from(val);
    chars[0] = chars[0].toUpperCase();
    setName(chars.join(''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Final normalization: trim, collapse whitespace, capitalize words.
    const normalizedName = normalizeSectionName(name);
    const normalizedLead = sectionLead
      ? capitalizeFirstLetter(sectionLead.trim())
      : undefined;

    if (!normalizedName || normalizedName.length < SECTION_NAME_MIN_LENGTH) {
      setError(t('validation.sectionNameMin', { count: SECTION_NAME_MIN_LENGTH }));
      return;
    }

    if (normalizedName.length > SECTION_NAME_MAX_LENGTH) {
      setError(t('validation.sectionNameMax', { count: SECTION_NAME_MAX_LENGTH }));
      return;
    }

    if (duplicateMessage) {
      setError(duplicateMessage);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          section_lead: normalizedLead,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        const createdSection: SectionOption = {
          id: json.data?.section?.id,
          name: normalizeSectionName(json.data?.section?.name ?? normalizedName),
          status: json.data?.section?.status,
        };
        onCreated(createdSection);
        onClose();
      } else {
        setError(
          json?.message ||
            (res.status === 409
              ? t('validation.sectionExists', { name: normalizedName })
              : t('modals.addSection.createFailed')),
        );
      }
    } catch {
      setError(t('modals.addSection.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      busy={saving}
      labelledBy="add-section-title"
      panelClassName="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800"
    >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            id="add-section-title"
            className="text-lg font-bold text-navy-800 dark:text-white"
          >
            {t('sections.form.addTitle')}
          </h3>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label={t('common:buttons.close')}
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Notice */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 border border-red-200 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300"
            >
              <FiAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section Name */}
          <div>
            <label
              htmlFor="add-section-name"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t('sections.form.nameLabel')} <span className="text-red-500">*</span>
            </label>
            <SpellCheckedNameInput
              id="add-section-name"
              value={name}
              onChange={handleNameChange}
              sections={allSections}
              extraDictionaryText={sectionLead}
              placeholder={t('sections.form.namePlaceholder')}
              disabled={saving}
              autoFocus
              maxLength={SECTION_NAME_MAX_LENGTH}
              invalid={Boolean(duplicateMessage || error)}
              ariaDescribedBy="add-section-name-hint"
              fieldClassName={FIELD_SHELL}
            />
            <p
              id="add-section-name-hint"
              className={`mt-1.5 text-[11px] font-medium ${
                duplicateMessage
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              aria-live="polite"
            >
              {duplicateMessage ??
                t('sections.form.nameHintCreate', { count: SECTION_NAME_MIN_LENGTH })}
            </p>
          </div>

          {/* Section Lead */}
          <div>
            <label
              htmlFor="add-section-lead"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t('sections.form.leadLabelOptional')}
            </label>
            <input
              id="add-section-lead"
              type="text"
              value={sectionLead}
              onChange={(e) => setSectionLead(e.target.value)}
              placeholder={t('sections.form.leadPlaceholderAlt')}
              spellCheck={false}
              autoCorrect="off"
              className="w-full rounded-xl bg-[#F4F7FE] dark:bg-navy-900 py-2.5 px-3.5 text-xs font-medium text-slate-800 dark:text-white border border-transparent focus:border-[#4318FF] focus:outline-none transition-colors placeholder:text-slate-400"
              disabled={saving}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="cancel"
              onClick={onClose}
              disabled={saving}
              className="flex-1"
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              loadingText={t('modals.creating')}
              disabled={!name.trim() || Boolean(duplicateMessage)}
              className="flex-1"
            >
              {t('sections.form.create')}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
