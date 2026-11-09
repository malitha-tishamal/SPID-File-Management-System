'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle } from 'react-icons/fi';
import {
  FILE_FIELD_COUNTER_WARN_AT,
  FILE_FIELD_MAX_LENGTH,
  countFileFieldCharacters,
  truncateFileField,
  type FileIdentityField,
} from 'lib/constants';

interface LimitedFileFieldProps {
  field: FileIdentityField;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  inputClassName: string;
  autoFocus?: boolean;
}

const MESSAGE_KEYS: Record<FileIdentityField, string> = {
  fileNo: 'validation.fileNoMax',
  fileName: 'validation.fileNameMax',
};

/**
 * File No / File Name input with a hard cap, a live counter and the shared
 * length message. Pasting more than the cap trims the value and explains why
 * instead of silently dropping the paste.
 */
export default function LimitedFileField({
  field,
  id,
  value,
  onChange,
  error,
  placeholder,
  inputClassName,
  autoFocus,
}: LimitedFileFieldProps) {
  const { t } = useTranslation('files');
  const [wasTrimmed, setWasTrimmed] = useState(false);

  const count = countFileFieldCharacters(value);
  const tone =
    count >= FILE_FIELD_MAX_LENGTH
      ? 'text-red-500 dark:text-red-400'
      : count >= FILE_FIELD_COUNTER_WARN_AT
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-slate-400 dark:text-slate-500';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (countFileFieldCharacters(next) > FILE_FIELD_MAX_LENGTH) {
      onChange(truncateFileField(next));
      setWasTrimmed(true);
      return;
    }
    onChange(next);
    setWasTrimmed(false);
  };

  const limitMessage = t(MESSAGE_KEYS[field], { max: FILE_FIELD_MAX_LENGTH });
  const maxMessage =
    error || (count >= FILE_FIELD_MAX_LENGTH ? limitMessage : '');
  const trimHint = wasTrimmed
    ? t('validation.trimmedToMax', { max: FILE_FIELD_MAX_LENGTH })
    : '';

  return (
    <>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={FILE_FIELD_MAX_LENGTH}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        className={inputClassName}
      />
      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0 break-words">
          {maxMessage && (
            <p
              role={error ? 'alert' : undefined}
              className="flex items-center gap-1 text-[11px] font-semibold text-red-500 dark:text-red-400"
            >
              <FiAlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{maxMessage}</span>
            </p>
          )}
          {trimHint && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <FiAlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{trimHint}</span>
            </p>
          )}
        </div>
        <span
          aria-live="polite"
          className={`shrink-0 text-[10px] font-bold tabular-nums ${tone}`}
        >
          {count} / {FILE_FIELD_MAX_LENGTH}
        </span>
      </div>
    </>
  );
}
