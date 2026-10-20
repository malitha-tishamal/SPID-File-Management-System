'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';
import { capitalizeFirstLetter, type SectionOption } from 'utils/fileImport';

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (section: SectionOption) => void;
}

export default function AddSectionModal({
  isOpen,
  onClose,
  onCreated,
}: AddSectionModalProps) {
  const [name, setName] = useState('');
  const [sectionLead, setSectionLead] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSectionLead('');
      setError(null);
      setSaving(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, isOpen, onClose]);

  if (!isOpen) return null;

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

    // Final normalization: trim and ensure first letter is capitalized
    const normalizedName = capitalizeFirstLetter(name);
    const normalizedLead = sectionLead ? capitalizeFirstLetter(sectionLead) : undefined;

    if (!normalizedName || normalizedName.length < 3) {
      setError('Section name must be at least 3 characters.');
      return;
    }

    if (normalizedName.length > 120) {
      setError('Section name must be 120 characters or fewer.');
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
          name: normalizedName,
        };
        onCreated(createdSection);
        onClose();
      } else {
        if (res.status === 409) {
          setError(`A section named "${normalizedName}" already exists.`);
        } else {
          setError(
            json?.error?.message ||
              'Failed to create section. Please check requirements and try again.',
          );
        }
      }
    } catch {
      setError('Network connection failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-navy-800 dark:text-white">
            Add New Section
          </h3>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Notice */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 border border-red-200 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300">
              <FiAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Section Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Engineering Central Registry"
              className="w-full rounded-xl bg-[#F4F7FE] dark:bg-navy-900 py-2.5 px-3.5 text-xs font-medium text-slate-800 dark:text-white border border-transparent focus:border-[#4318FF] focus:outline-none transition-colors placeholder:text-slate-400"
              disabled={saving}
              autoFocus
            />
          </div>

          {/* Section Lead */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Section Lead (Optional)
            </label>
            <input
              type="text"
              value={sectionLead}
              onChange={(e) => setSectionLead(e.target.value)}
              placeholder="e.g. Dr. J. Philips"
              className="w-full rounded-xl bg-[#F4F7FE] dark:bg-navy-900 py-2.5 px-3.5 text-xs font-medium text-slate-800 dark:text-white border border-transparent focus:border-[#4318FF] focus:outline-none transition-colors placeholder:text-slate-400"
              disabled={saving}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl bg-[#4318FF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 transition-colors hover:bg-[#3311CC] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg
                    className="h-3.5 w-3.5 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Creating...</span>
                </>
              ) : (
                'Create Section'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
