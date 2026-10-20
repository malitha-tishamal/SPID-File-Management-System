'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiX,
  FiUploadCloud,
  FiDownload,
  FiCheckCircle,
  FiAlertCircle,
  FiFileText,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import {
  downloadBulkImportSample,
  parseAndValidateImportBuffer,
  type ImportValidationResult,
  type RowError,
  type ValidatedRecord,
  type SectionOption,
} from 'utils/fileImport';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
  activeSections?: SectionOption[];
}

type ImportStage =
  | 'idle'
  | 'validating_file'
  | 'validating_headers'
  | 'validating_rows'
  | 'validated'
  | 'importing'
  | 'completed'
  | 'failed';

export default function BulkImportModal({
  isOpen,
  onClose,
  onSuccess,
  activeSections = [],
}: BulkImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ImportStage>('idle');
  const [progressPct, setProgressPct] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

  // Import outcome counts
  const [totalRows, setTotalRows] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setStage('idle');
      setProgressPct(0);
      setStatusMessage('');
      setValidationResult(null);
      setTotalRows(0);
      setImportedCount(0);
      setFailedCount(0);
      setServerErrors([]);
      setShowErrorDetails(false);
    }
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    if (stage === 'importing') {
      if (!window.confirm('An import is currently in progress. Are you sure you want to cancel?')) {
        return;
      }
    }
    onClose();
  }, [stage, onClose]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'importing' && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stage, isOpen, handleCancel]);

  if (!isOpen) return null;

  const handleDownloadSample = () => {
    const sectionNames = activeSections.map((s) => s.name);
    downloadBulkImportSample(sectionNames);
  };

  /** Process selected file */
  const handleFileSelection = async (file: File) => {
    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileNameLower = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => fileNameLower.endsWith(ext));

    if (!hasValidExt) {
      alert('Please upload a valid CSV (.csv) or Excel (.xlsx, .xls) file.');
      return;
    }

    // Validate size (10 MB limit)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      alert('File size exceeds the 10MB limit. Please upload a smaller file.');
      return;
    }

    setSelectedFile(file);
    setServerErrors([]);

    // Run client-side validation stages
    setStage('validating_file');
    setStatusMessage('Reading file content...');
    setProgressPct(15);

    try {
      const buffer = await file.arrayBuffer();

      setStage('validating_headers');
      setStatusMessage('Validating column headers...');
      setProgressPct(35);

      await new Promise((r) => setTimeout(r, 80));

      setStage('validating_rows');
      setStatusMessage('Checking row values and date constraints...');
      setProgressPct(60);

      const sectionNames = activeSections.map((s) => s.name);
      const result = await parseAndValidateImportBuffer(buffer, sectionNames);

      setValidationResult(result);
      setTotalRows(result.totalRows);

      if (!result.isValid && result.validRows.length === 0) {
        setStage('failed');
        setProgressPct(100);
        setStatusMessage('Validation failed. Please correct header or row errors.');
        setFailedCount(result.errors.length);
        return;
      }

      setStage('validated');
      setProgressPct(75);
      setStatusMessage(
        result.errors.length > 0
          ? `Ready to import. ${result.validRows.length} valid rows, ${result.errors.length} rows with errors.`
          : `Ready to import: ${result.validRows.length} records ready.`,
      );
    } catch {
      setStage('failed');
      setProgressPct(0);
      setStatusMessage('Failed to parse file. Please verify file format.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    if (stage === 'importing') return;
    setSelectedFile(null);
    setValidationResult(null);
    setStage('idle');
    setProgressPct(0);
    setStatusMessage('');
    setServerErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Execute real database bulk import */
  const handleStartImport = async () => {
    if (!validationResult || validationResult.validRows.length === 0) return;

    setStage('importing');
    setStatusMessage('Connecting to archive database...');
    setProgressPct(80);

    const validRows = validationResult.validRows;
    const batchSize = 25;
    let totalImported = 0;
    const allErrors: RowError[] = [...validationResult.errors];

    try {
      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize);
        const currentBatchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(validRows.length / batchSize);

        setStatusMessage(
          `Importing batch ${currentBatchNum} of ${totalBatches} (${totalImported} saved)...`,
        );

        // Calculate honest proportional progress from 80% to 98%
        const batchPct = Math.min(
          98,
          Math.round(80 + ((i + batch.length) / validRows.length) * 18),
        );
        setProgressPct(batchPct);

        const res = await fetch('/api/admin/files/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: batch }),
        });

        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          totalImported += json.data?.importedCount || batch.length;
          if (Array.isArray(json.data?.errors)) {
            allErrors.push(...json.data.errors);
          }
        } else {
          // Record batch failure
          batch.forEach((r) => {
            allErrors.push({
              row: r.rowIndex,
              file_name: r.file_name,
              reason: json?.error?.message || 'Server-side batch insert rejected.',
            });
          });
        }
      }

      setImportedCount(totalImported);
      setFailedCount(allErrors.length);
      setServerErrors(allErrors);
      setProgressPct(100);

      if (totalImported > 0) {
        setStage('completed');
        setStatusMessage(`Import completed! ${totalImported} file records successfully registered.`);
        onSuccess(totalImported);
      } else {
        setStage('failed');
        setStatusMessage('Import failed. No records could be saved to the database.');
      }
    } catch {
      setStage('failed');
      setProgressPct(100);
      setStatusMessage('Network connection error occurred during import.');
    }
  };

  const allDisplayErrors = [
    ...(validationResult?.errors || []),
    ...serverErrors.filter(
      (se) => !(validationResult?.errors || []).some((ve) => ve.row === se.row),
    ),
  ];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-navy-700">
          <div>
            <h3 className="text-xl font-bold text-navy-800 dark:text-white">
              Import Your Bulk
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
              Upload bulk spreadsheets from here into the archive repository
            </p>
          </div>
          <button
            type="button"
            disabled={stage === 'importing'}
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          {/* STEP 1: DOWNLOAD TEMPLATE */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              STEP 1: DOWNLOAD TEMPLATE
            </div>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#F4F2FF] hover:bg-[#ece8ff] text-[#4318FF] dark:bg-brand-900/30 dark:hover:bg-brand-900/40 dark:text-brand-300 border border-[#4318FF]/20 text-xs font-bold transition-all shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <FiDownload className="h-4 w-4" />
              <span>Download Sample Document (.xlsx)</span>
            </button>
          </div>

          {/* STEP 2: UPLOAD COMPLETED FILE */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              STEP 2: UPLOAD COMPLETED FILE
            </div>

            {/* Hidden Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />

            {!selectedFile ? (
              /* Dropzone */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-[#4318FF] bg-[#F4F2FF]/60 dark:bg-brand-900/20'
                    : 'border-slate-200 dark:border-navy-600 bg-slate-50/50 dark:bg-navy-900/40 hover:border-[#4318FF] dark:hover:border-brand-400'
                }`}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-navy-800 shadow-sm text-[#4318FF] dark:text-brand-300 mb-2.5">
                  <FiUploadCloud className="h-6 w-6 stroke-[2]" />
                </div>
                <p className="text-xs font-bold text-navy-800 dark:text-white">
                  Upload Sample Document
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  Supports: CSV, XLSX, XLS (Max File: 10MB)
                </p>
              </div>
            ) : (
              /* Selected File Card */
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-navy-700 bg-slate-50/60 dark:bg-navy-900/60 p-3.5">
                <div className="flex items-center gap-3 truncate">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
                    <FiFileText className="h-5 w-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-navy-800 dark:text-white truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB •{' '}
                      {selectedFile.name.endsWith('.csv') ? 'CSV File' : 'Excel Workbook'}
                    </p>
                  </div>
                </div>

                {stage !== 'importing' && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* PROGRESS & STATUS BAR */}
          {selectedFile && stage !== 'idle' && (
            <div className="rounded-2xl border border-slate-100 dark:border-navy-700 bg-white dark:bg-navy-900/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {stage === 'completed' ? (
                    <FiCheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : stage === 'failed' ? (
                    <FiAlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[#4318FF] animate-pulse" />
                  )}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {statusMessage || 'Processing records...'}
                  </span>
                </div>
                <span className="font-bold text-[#4318FF] dark:text-brand-300">
                  {progressPct}%
                </span>
              </div>

              {/* Progress track */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                <div
                  className={`h-full transition-all duration-300 ease-out rounded-full ${
                    stage === 'failed'
                      ? 'bg-red-500'
                      : stage === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-[#4318FF]'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Record counter summary */}
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-400 pt-1">
                <span>
                  {stage === 'completed'
                    ? `${importedCount} records imported`
                    : stage === 'importing'
                    ? `${importedCount} records saved`
                    : validationResult
                    ? `${validationResult.validRows.length} valid records detected`
                    : 'Analyzing records...'}
                </span>
                <span>Total {totalRows} rows</span>
              </div>
            </div>
          )}

          {/* VALIDATION & ERROR INFORMATION */}
          {allDisplayErrors.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <FiAlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    Validation Issues ({allDisplayErrors.length} {allDisplayErrors.length === 1 ? 'row' : 'rows'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="flex items-center gap-1 font-semibold text-amber-700 hover:underline dark:text-amber-300 cursor-pointer"
                >
                  <span>{showErrorDetails ? 'Hide' : 'View'} Details</span>
                  {showErrorDetails ? <FiChevronUp className="h-3.5 w-3.5" /> : <FiChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>

              {showErrorDetails && (
                <div className="mt-2.5 max-h-36 overflow-y-auto space-y-1 pr-1">
                  {allDisplayErrors.map((err, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-white/80 dark:bg-navy-900/80 p-2 text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200/60 dark:border-navy-700 flex items-start gap-2"
                    >
                      <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0">
                        Row {err.row}:
                      </span>
                      <span>
                        {err.file_name ? `"${err.file_name}" — ` : ''}
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-navy-700">
          <button
            type="button"
            onClick={handleCancel}
            disabled={stage === 'importing'}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300 cursor-pointer text-center"
          >
            {stage === 'completed' ? 'Close' : 'Cancel'}
          </button>

          {stage === 'completed' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-[#05CD99] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/20 hover:bg-[#04B787] transition-all cursor-pointer text-center"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              disabled={
                !validationResult ||
                validationResult.validRows.length === 0 ||
                stage === 'importing'
              }
              onClick={handleStartImport}
              className="flex-1 rounded-xl bg-[#4318FF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 hover:bg-[#3311CC] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {stage === 'importing' ? (
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
                  <span>Importing...</span>
                </>
              ) : (
                'Import Records'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
