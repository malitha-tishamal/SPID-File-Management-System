'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  FiShield,
  FiLock,
} from 'react-icons/fi';
import {
  downloadBulkImportSample,
  type RowError,
  type SectionOption,
} from 'utils/fileImport';
import Button from 'components/ui/Button';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
  activeSections?: SectionOption[];
  includeLocationFields?: boolean; // If true, includes Locker No, Shelf Name, Shelf Position (Admin)
}

type ImportStage =
  | 'idle'
  | 'uploading'
  | 'scanning'
  | 'importing'
  | 'completed'
  | 'failed';

type ScanState = 'idle' | 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';

interface SecurityNotice {
  type: 'success' | 'error';
  title: string;
  message: string;
}

const BUSY_STAGES: ImportStage[] = ['uploading', 'scanning', 'importing'];
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export default function BulkImportModal({
  isOpen,
  onClose,
  onSuccess,
  activeSections = [],
  includeLocationFields = true,
}: BulkImportModalProps) {
  const { t } = useTranslation('files');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ImportStage>('idle');
  const [progressPct, setProgressPct] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [securityNotice, setSecurityNotice] = useState<SecurityNotice | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  // Import outcome counts
  const [totalRows, setTotalRows] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isBusy = BUSY_STAGES.includes(stage);

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach((t) => clearTimeout(t));
    stageTimersRef.current = [];
  }, []);

  const resetOutcome = useCallback(() => {
    setTotalRows(0);
    setImportedCount(0);
    setFailedCount(0);
    setDuplicateCount(0);
    setValidationErrorCount(0);
    setServerErrors([]);
    setShowErrorDetails(false);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setStage('idle');
      setProgressPct(0);
      setStatusMessage('');
      setScanState('idle');
      setSecurityNotice(null);
      setClientError(null);
      resetOutcome();
    }
  }, [isOpen, resetOutcome]);

  // Clear cosmetic timers on unmount
  useEffect(() => clearStageTimers, [clearStageTimers]);

  const handleCancel = useCallback(() => {
    // Closing mid-flight would abandon the request while the server is still
    // scanning/importing, so the modal stays locked until the call settles.
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isBusy) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBusy, handleCancel]);

  if (!isOpen) return null;

  const handleDownloadSample = () => {
    const sectionNames = activeSections.map((s) => s.name);
    downloadBulkImportSample(sectionNames, includeLocationFields);
  };

  /** Client-side smoke check only. Real format/scan/row validation is server-side. */
  const handleFileSelection = (file: File) => {
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileNameLower = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => fileNameLower.endsWith(ext));

    if (!hasValidExt) {
      setClientError(t('bulkImport.errExtension'));
      return;
    }
    if (file.size <= 0) {
      setClientError(t('bulkImport.errEmpty'));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setClientError(t('bulkImport.errTooLarge'));
      return;
    }

    setClientError(null);
    setSelectedFile(file);
    setStage('idle');
    setProgressPct(0);
    setStatusMessage(t('bulkImport.readyToUpload'));
    setScanState('pending');
    setSecurityNotice(null);
    resetOutcome();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isBusy) return;
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
    if (isBusy) return;
    setSelectedFile(null);
    setStage('idle');
    setProgressPct(0);
    setStatusMessage('');
    setScanState('idle');
    setSecurityNotice(null);
    setClientError(null);
    resetOutcome();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Upload the spreadsheet once; the server quarantines, scans, then imports. */
  const handleStartImport = async () => {
    if (!selectedFile || isBusy) return;

    clearStageTimers();
    resetOutcome();
    setClientError(null);
    setSecurityNotice(null);
    setScanState('pending');
    setStage('uploading');
    setProgressPct(12);
    setStatusMessage(t('bulkImport.uploading'));

    // The API performs upload → scan → validation → import in one request;
    // these markers reflect the server-side phases while it is in flight.
    stageTimersRef.current.push(
      setTimeout(() => {
        setStage('scanning');
        setScanState('scanning');
        setProgressPct(40);
        setStatusMessage(t('bulkImport.scanningFile'));
      }, 900),
      setTimeout(() => {
        setStage('importing');
        setProgressPct(72);
        setStatusMessage(t('bulkImport.validating'));
      }, 4500),
    );

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/admin/files/bulk-import', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => null);
      clearStageTimers();

      if (!res.ok || !json?.ok) {
        setProgressPct(100);
        setStage('failed');

        if (json?.code === 'MALWARE_DETECTED') {
          setScanState('infected');
          setStatusMessage(t('bulkImport.blockedByScanner'));
          setSecurityNotice({
            type: 'error',
            title: t('bulkImport.malwareTitle'),
            message: t('bulkImport.malwareMessage'),
          });
        } else if (json?.code === 'SCANNER_UNAVAILABLE') {
          setScanState('failed');
          setStatusMessage(t('bulkImport.scanUnavailableStatus'));
          setSecurityNotice({
            type: 'error',
            title: t('bulkImport.scannerUnavailableTitle'),
            message: t('bulkImport.scannerUnavailableMessage'),
          });
        } else {
          setScanState('idle');
          setStatusMessage(t('bulkImport.importFailedStatus'));
          setSecurityNotice({
            type: 'error',
            title: t('bulkImport.importFailedTitle'),
            message: json?.message || t('bulkImport.importFailedMessage'),
          });
        }
        return;
      }

      const data = json.data || {};
      const imported = Number(data.importedCount) || 0;
      const failed = Number(data.failedCount) || 0;

      setTotalRows(Number(data.totalRows) || 0);
      setImportedCount(imported);
      setFailedCount(failed);
      setDuplicateCount(Number(data.duplicateCount) || 0);
      setValidationErrorCount(Number(data.validationErrorCount) || 0);
      setServerErrors(Array.isArray(data.errors) ? data.errors : []);
      setScanState('clean');
      setProgressPct(100);

      if (imported > 0) {
        setStage('completed');
        setStatusMessage(
          data.pending
            ? t('bulkImport.completedSubmitted', { count: imported })
            : t('bulkImport.completedRegistered', { count: imported }),
        );
        setSecurityNotice({
          type: 'success',
          title: t('bulkImport.scanPassedTitle'),
          message: data.scan?.message || t('bulkImport.scanPassedMessage'),
        });
        onSuccess(imported);
      } else {
        setStage('failed');
        setStatusMessage(t('bulkImport.noRecordsStatus'));
        setSecurityNotice({
          type: 'error',
          title: t('bulkImport.noRecordsTitle'),
          message: data.message || t('bulkImport.noRecordsMessage'),
        });
      }
    } catch {
      clearStageTimers();
      setStage('failed');
      setScanState('failed');
      setProgressPct(100);
      setStatusMessage(t('bulkImport.networkStatus'));
      setSecurityNotice({
        type: 'error',
        title: t('bulkImport.interruptedTitle'),
        message: t('bulkImport.interruptedMessage'),
      });
    }
  };

  const scanLabel =
    scanState === 'clean'
      ? t('bulkImport.scanClean')
      : scanState === 'scanning' || scanState === 'pending'
      ? t('bulkImport.scanScanning')
      : scanState === 'infected'
      ? t('bulkImport.scanBlocked')
      : scanState === 'failed'
      ? t('bulkImport.scanFailed')
      : null;

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
              {t('bulkImport.title')}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
              {t('bulkImport.subtitle')}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 dark:hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('common:buttons.close')}
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          {/* STEP 1: DOWNLOAD TEMPLATE */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {t('bulkImport.step1')}
            </div>
            <button
              type="button"
              onClick={handleDownloadSample}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#F4F2FF] hover:bg-[#ece8ff] text-[#4318FF] dark:bg-brand-900/30 dark:hover:bg-brand-900/40 dark:text-brand-300 border border-[#4318FF]/20 text-xs font-bold transition-all shadow-xs active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiDownload className="h-4 w-4" />
              <span>{t('bulkImport.downloadSample')}</span>
            </button>
          </div>

          {/* STEP 2: UPLOAD COMPLETED FILE */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {t('bulkImport.step2')}
            </div>

            {/* Hidden Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              disabled={isBusy}
              className="hidden"
            />

            {!selectedFile ? (
              /* Dropzone */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isBusy) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isBusy && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  isBusy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isDragOver
                    ? 'border-[#4318FF] bg-[#F4F2FF]/60 dark:bg-brand-900/20'
                    : 'border-slate-200 dark:border-navy-600 bg-slate-50/50 dark:bg-navy-900/40 hover:border-[#4318FF] dark:hover:border-brand-400'
                }`}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-navy-800 shadow-sm text-[#4318FF] dark:text-brand-300 mb-2.5">
                  <FiUploadCloud className="h-6 w-6 stroke-[2]" />
                </div>
                <p className="text-xs font-bold text-navy-800 dark:text-white">
                  {t('bulkImport.dropzoneTitle')}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  {t('bulkImport.dropzoneHint')}
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
                      {selectedFile.name.toLowerCase().endsWith('.csv')
                        ? t('bulkImport.fileTypeCsv')
                        : t('bulkImport.fileTypeExcel')}
                    </p>
                  </div>
                </div>

                {!isBusy && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title={t('bulkImport.removeFile')}
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {clientError && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 p-2.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{clientError}</span>
              </div>
            )}

            {/* Scan-first assurance */}
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-navy-900/50 border border-slate-100 dark:border-navy-700 p-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <FiLock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4318FF] dark:text-brand-300" />
              <span>{t('bulkImport.scanAssurance')}</span>
            </div>
          </div>

          {/* SECURITY NOTICE */}
          {securityNotice && (
            <div
              className={`rounded-2xl border p-3.5 flex items-start gap-3 ${
                securityNotice.type === 'error'
                  ? 'border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/25'
              }`}
              role="alert"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  securityNotice.type === 'error'
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}
              >
                {securityNotice.type === 'error' ? (
                  <FiShield className="h-5 w-5" />
                ) : (
                  <FiCheckCircle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-bold ${
                    securityNotice.type === 'error'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {securityNotice.title}
                </p>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    securityNotice.type === 'error'
                      ? 'text-red-600/90 dark:text-red-300/90'
                      : 'text-emerald-700/90 dark:text-emerald-300/90'
                  }`}
                >
                  {securityNotice.message}
                </p>
              </div>
            </div>
          )}

          {/* PROGRESS & STATUS BAR */}
          {selectedFile && stage !== 'idle' && !securityNotice && (
            <div className="rounded-2xl border border-slate-100 dark:border-navy-700 bg-white dark:bg-navy-900/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {stage === 'completed' ? (
                    <FiCheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : stage === 'failed' ? (
                    <FiAlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[#4318FF] animate-pulse" />
                  )}
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                    {statusMessage || t('bulkImport.processing')}
                  </span>
                </div>
                <span className="font-bold text-[#4318FF] dark:text-brand-300 shrink-0">
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

              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-400 pt-1 gap-2">
                <span className="flex items-center gap-1.5">
                  <FiShield className="h-3.5 w-3.5" />
                  <span>{t('bulkImport.securityScan', { status: scanLabel || t('bulkImport.scanQueued') })}</span>
                </span>
                <span className="truncate">
                  {stage === 'completed'
                    ? t('bulkImport.rowsImported', { imported: importedCount, total: totalRows })
                    : t('bulkImport.waiting')}
                </span>
              </div>
            </div>
          )}

          {/* RESULT SUMMARY */}
          {stage === 'completed' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: t('bulkImport.resultTotal'), value: totalRows, tone: 'text-slate-700 dark:text-slate-200' },
                { label: t('bulkImport.resultImported'), value: importedCount, tone: 'text-emerald-600 dark:text-emerald-400' },
                { label: t('bulkImport.resultDuplicates'), value: duplicateCount, tone: 'text-amber-600 dark:text-amber-400' },
                { label: t('bulkImport.resultFailed'), value: failedCount, tone: 'text-red-600 dark:text-red-400' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-100 dark:border-navy-700 bg-slate-50/70 dark:bg-navy-900/60 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                    {item.label}
                  </p>
                  <p className={`text-base font-bold ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* VALIDATION & ERROR INFORMATION */}
          {serverErrors.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <FiAlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {validationErrorCount > 0
                      ? t('bulkImport.issuesWithInvalid', {
                          count: serverErrors.length,
                          invalid: validationErrorCount,
                        })
                      : t('bulkImport.issues', { count: serverErrors.length })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="flex items-center gap-1 font-semibold text-amber-700 hover:underline dark:text-amber-300 cursor-pointer"
                >
                  <span>
                    {showErrorDetails
                      ? t('bulkImport.hideDetails')
                      : t('common:buttons.viewDetails')}
                  </span>
                  {showErrorDetails ? (
                    <FiChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <FiChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {showErrorDetails && (
                <div className="mt-2.5 max-h-36 overflow-y-auto space-y-1 pr-1">
                  {serverErrors.map((err, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-white/80 dark:bg-navy-900/80 p-2 text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200/60 dark:border-navy-700 flex items-start gap-2"
                    >
                      <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0">
                        {t('bulkImport.rowLabel', { row: err.row })}
                      </span>
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {err.file_name ? t('bulkImport.rowFile', { name: err.file_name }) : ''}
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
          <Button
            type="button"
            variant={stage === 'completed' ? 'secondary' : 'cancel'}
            size="sm"
            onClick={handleCancel}
            disabled={isBusy}
            className="flex-1"
          >
            {stage === 'completed' ? t('common:buttons.close') : t('common:buttons.cancel')}
          </Button>

          {stage === 'completed' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-[#05CD99] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/20 hover:bg-[#04B787] transition-all cursor-pointer text-center"
            >
              {t('bulkImport.done')}
            </button>
          ) : (
            <button
              type="button"
              disabled={!selectedFile || isBusy}
              onClick={handleStartImport}
              className="flex-1 rounded-xl bg-[#4318FF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 hover:bg-[#3311CC] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isBusy ? (
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
                  <span>
                    {stage === 'scanning'
                      ? t('bulkImport.scanningBtn')
                      : stage === 'importing'
                      ? t('bulkImport.importingBtn')
                      : t('bulkImport.uploadingBtn')}
                  </span>
                </>
              ) : stage === 'failed' ? (
                t('bulkImport.retryImport')
              ) : (
                t('bulkImport.importRecords')
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
