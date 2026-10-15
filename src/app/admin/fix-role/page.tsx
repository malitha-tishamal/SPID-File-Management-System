'use client';
import React, { useEffect, useState } from 'react';
import { FiShield, FiCheckCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';

export default function FixRolePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const checkRole = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/fix-role');
      const json = await res.json();
      if (json.ok) setProfile(json.data);
      else setProfile(null);
    } catch {
      setProfile(null);
    }
    setLoading(false);
  };

  const promoteToAdmin = async () => {
    setPromoting(true);
    try {
      const res = await fetch('/api/admin/fix-role', { method: 'POST' });
      const json = await res.json();
      setResult({ ok: json.ok, message: json.data?.message || json.message || 'Unknown result.' });
      if (json.ok) checkRole();
    } catch {
      setResult({ ok: false, message: 'Could not reach the server.' });
    }
    setPromoting(false);
  };

  useEffect(() => { checkRole(); }, []);

  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-6 py-16">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-brand-500 shadow-xl text-white">
          <MdAdminPanelSettings className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Administrator Role Setup</h1>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          This utility promotes your account to <strong>Administrator</strong> in the Supabase
          profiles table, which is required to access Admin Management and User Management pages.
        </p>
      </div>

      {/* Current Status Card */}
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-navy-700 p-5 shadow-md">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Current Account Status</p>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#4318FF]" />
            Checking...
          </div>
        ) : profile ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-navy-700 dark:text-white">{profile.full_name}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                profile.role === 'Administrator'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {profile.role}
              </span>
            </div>
            <p className="text-xs text-gray-400">{profile.email}</p>
            <p className="text-xs text-gray-400">Status: <strong className="text-navy-700 dark:text-white">{profile.account_status}</strong></p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-500">
            <FiAlertCircle className="h-4 w-4" />
            <span className="text-sm">Not signed in or profile not found.</span>
          </div>
        )}
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`w-full max-w-md flex items-start gap-3 rounded-xl p-4 ${
          result.ok
            ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700'
            : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-700'
        }`}>
          {result.ok
            ? <FiCheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            : <FiAlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          }
          <p className={`text-sm font-medium ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {result.message}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-3 w-full max-w-md">
        {profile && profile.role !== 'Administrator' && (
          <button
            onClick={promoteToAdmin}
            disabled={promoting}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#4318FF] py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-500/30 transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {promoting ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Promoting...</>
            ) : (
              <><FiShield className="h-4 w-4" /> Promote My Account to Administrator</>
            )}
          </button>
        )}

        {profile?.role === 'Administrator' && (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white">
            <FiCheckCircle className="h-4 w-4" /> Already an Administrator — Go to{' '}
            <a href="/admin/admin-management" className="underline">Admin Management</a>
          </div>
        )}

        <button
          onClick={checkRole}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-[#4318FF] transition-colors"
        >
          <FiRefreshCw className="h-3.5 w-3.5" /> Refresh Status
        </button>
      </div>

      <div className="mt-4 flex gap-4">
        <a href="/admin/admin-management" className="text-xs text-[#4318FF] underline hover:text-brand-600">→ Admin Management</a>
        <a href="/admin/users" className="text-xs text-[#4318FF] underline hover:text-brand-600">→ User Management</a>
        <a href="/admin/default" className="text-xs text-gray-400 underline hover:text-gray-600">← Dashboard</a>
      </div>
    </div>
  );
}
