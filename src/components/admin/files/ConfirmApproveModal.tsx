'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiMapPin, FiChevronDown } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import FileModalShell from './FileModalShell';
import Button from 'components/ui/Button';
import AttributedUser from 'components/ui/AttributedUser';

export default function ConfirmApproveModal({
  file,
  loading = false,
  onConfirm,
  onCancel,
}: {
  file: FileRecordRow | null;
  loading?: boolean;
  onConfirm: (storageData: { locker_no: string | null; shelf_name: string | null; shelf_position: string | null }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('files');
  const [lockerNo, setLockerNo] = useState('');
  const [shelfName, setShelfName] = useState('');
  const [shelfPosition, setShelfPosition] = useState<'Front' | 'Middle' | 'Back'>('Front');

  if (!file) return null;

  const handleConfirm = () => {
    onConfirm({
      locker_no: lockerNo.trim() || null,
      shelf_name: shelfName.trim() || null,
      shelf_position: shelfPosition,
    });
  };

  return (
    <FileModalShell
      title={t('modals.approveTitle')}
      subtitle={t('modals.approveSubtitle')}
      icon={<FiCheckCircle className="h-5 w-5" />}
      iconTone="emerald"
      size="lg"
      onClose={onCancel}
      closeDisabled={loading}
      footer={
        <>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            {t('common:buttons.cancel')}
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#05CD99] py-2.5 text-xs font-bold text-white shadow-md shadow-[#05CD99]/25 transition-all hover:bg-[#04B787] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05CD99] focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('modals.approving')}</span>
              </>
            ) : (
              <>
                <FiCheckCircle className="h-4 w-4" />
                <span>{t('table.actionApproveFile')}</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* File Details Section */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs dark:border-navy-700 dark:bg-navy-900/50">
          <p className="mb-3 leading-relaxed text-slate-500 dark:text-slate-300">
            {t('modals.approveIntro')}
          </p>
          <div className="flex flex-col gap-1.5 border-t border-slate-200/60 pt-2.5 dark:border-navy-700">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.fileNumber')}</span>
              <span
                className="max-w-[240px] break-words text-right font-mono font-bold text-[#4318FF] dark:text-brand-300 [overflow-wrap:anywhere]"
                title={file.file_no}
              >
                {file.file_no}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="shrink-0 font-semibold text-slate-400">{t('modals.fileName')}</span>
              <span
                className="max-w-[240px] truncate text-right font-bold text-slate-800 dark:text-white"
                title={file.file_name}
              >
                {file.file_name}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.section')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                {file.section_name}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.startDate')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                {file.start_date}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.endDate')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                {file.end_date}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.pageNumbers')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                {file.page_numbers || 0}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.minuteSheets')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                {file.minute_sheets_count || 0}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.submittedBy')}</span>
              <span className="text-right font-bold text-slate-700 dark:text-slate-300">
                <AttributedUser
                  name={file.registrar_name}
                  deleted={file.registrar_is_deleted}
                  fallback={t('common:roles.STAFF')}
                />{' '}
                ({file.registrar_role || t('table.roleStaff')})
              </span>
            </div>
          </div>
        </div>

        {/* Storage Location Section */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-xs dark:border-navy-700 dark:bg-navy-800">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#FF5B5B] dark:text-rose-400">
              <FiMapPin className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm font-bold text-navy-800 dark:text-white">
              {t('modals.storageHeading')}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Locker No */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('modals.lockerLabelUpper')}
              </label>
              <input
                type="text"
                value={lockerNo}
                onChange={(e) => setLockerNo(e.target.value)}
                placeholder={t('modals.lockerPlaceholder')}
                disabled={loading}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Shelf Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('modals.shelfLabelUpper')}
              </label>
              <input
                type="text"
                value={shelfName}
                onChange={(e) => setShelfName(e.target.value)}
                placeholder={t('modals.shelfPlaceholder')}
                disabled={loading}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Shelf Position */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('modals.positionLabelUpper')}
              </label>
              <div className="relative">
                <select
                  value={shelfPosition}
                  onChange={(e) => setShelfPosition(e.target.value as 'Front' | 'Middle' | 'Back')}
                  disabled={loading}
                  className="h-10 w-full appearance-none rounded-xl bg-white dark:bg-navy-900 px-3.5 pr-9 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="Front">{t('position.front')}</option>
                  <option value="Middle">{t('position.middle')}</option>
                  <option value="Back">{t('position.back')}</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <FiChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FileModalShell>
  );
}
