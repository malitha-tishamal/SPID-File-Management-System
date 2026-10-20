'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiChevronDown, FiSearch, FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { filterSectionsByQuery, type SectionOption } from 'utils/fileImport';

interface SectionComboboxProps {
  sections: SectionOption[];
  value: string;
  onChange: (value: string) => void;
  onOpenAddSection: () => void;
  error?: string;
  disabled?: boolean;
}

export default function SectionCombobox({
  sections,
  value,
  onChange,
  onOpenAddSection,
  error,
  disabled = false,
}: SectionComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Universal search: case-insensitive, whitespace trimmed
  const filteredSections = useMemo(() => {
    return filterSectionsByQuery(sections, searchQuery);
  }, [sections, searchQuery]);

  const handleSelect = (sectionName: string) => {
    onChange(sectionName);
    setIsOpen(false);
  };

  const handleOpenAdd = () => {
    setIsOpen(false);
    onOpenAddSection();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Combobox Trigger Field */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`h-10 w-full flex items-center justify-between rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium outline-none border transition-all text-left ${
          error
            ? 'border-red-500 ring-2 ring-red-500/10'
            : isOpen
            ? 'border-[#4318FF] ring-2 ring-[#4318FF]/10 dark:border-brand-400'
            : 'border-slate-200 dark:border-navy-700 hover:border-slate-300 dark:hover:border-navy-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={`truncate block ${
            value ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-400'
          }`}
        >
          {value || 'Ex: Admin, Development, Account'}
        </span>
        <FiChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#4318FF]' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 rounded-2xl bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 shadow-xl shadow-slate-900/10 dark:shadow-navy-950/40 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Universal Search Header */}
          <div className="p-2 border-b border-slate-100 dark:border-navy-700">
            <div className="flex h-9 w-full items-center gap-2 rounded-xl bg-[#F4F7FE] dark:bg-navy-900 px-3 border border-slate-200/60 dark:border-navy-700">
              <FiSearch className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sections..."
                className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full"
                  title="Clear search"
                >
                  <FiX className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Section Options List */}
          <div className="max-h-56 overflow-y-auto p-1.5 flex flex-col gap-0.5">
            {filteredSections.length > 0 ? (
              filteredSections.map((s, idx) => {
                const isSelected = value === s.name;
                return (
                  <button
                    key={s.id ?? idx}
                    type="button"
                    onClick={() => handleSelect(s.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-[#F4F2FF] text-[#4318FF] font-bold dark:bg-brand-900/30 dark:text-brand-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-700/60 font-medium'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    {isSelected && <FiCheck className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300 shrink-0 ml-2" />}
                  </button>
                );
              })
            ) : (
              <div className="py-4 px-3 text-center text-xs text-slate-400 dark:text-slate-500">
                No sections found matching &ldquo;<span className="font-semibold text-slate-600 dark:text-slate-300">{searchQuery.trim()}</span>&rdquo;
              </div>
            )}
          </div>

          {/* "+ Add Section" Fixed Bottom Action */}
          <div className="border-t border-slate-100 dark:border-navy-700 p-1.5 bg-slate-50/70 dark:bg-navy-900/50">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-[#4318FF] dark:text-brand-300 hover:bg-[#F4F2FF] dark:hover:bg-brand-900/30 transition-all cursor-pointer border border-transparent hover:border-[#4318FF]/20"
            >
              <FiPlus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>+ Add Section</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
