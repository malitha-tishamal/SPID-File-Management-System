import React from 'react';
import { FiShield, FiFileText } from 'react-icons/fi';

const DepartmentBadgeCard = () => {
  return (
    <div className="relative mt-10 flex w-[256px] flex-col items-center justify-center rounded-[20px] bg-gradient-to-br from-[#4318FF] via-[#3311db] to-[#1e0a8a] p-5 pb-6 text-white shadow-xl shadow-indigo-600/20">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
        <FiShield className="h-6 w-6 text-white" />
      </div>

      <div className="text-center">
        <p className="text-sm font-bold tracking-tight text-white">
          SPID File Management
        </p>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-indigo-100/90">
          Southern Provincial Irrigation Department Central Registry &amp; Dossiers
        </p>
      </div>

      <div className="mt-4 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white backdrop-blur-sm border border-white/10">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Secure Archival System</span>
      </div>
    </div>
  );
};

export default DepartmentBadgeCard;
