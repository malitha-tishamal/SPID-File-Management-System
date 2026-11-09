/**
 * Every translation dictionary, assembled in one place.
 *
 * The locales are bundled rather than fetched: the portal has to be able to
 * switch language instantly, offline, and before the first request lands.
 * Each namespace owns a page area, so a page's copy lives in exactly one file.
 */

import enCommon from 'i18n/locales/en/common.json';
import enNav from 'i18n/locales/en/nav.json';
import enShell from 'i18n/locales/en/shell.json';
import enDashboard from 'i18n/locales/en/dashboard.json';
import enAuth from 'i18n/locales/en/auth.json';
import enFiles from 'i18n/locales/en/files.json';
import enRequests from 'i18n/locales/en/requests.json';
import enStaffRequests from 'i18n/locales/en/staffRequests.json';
import enIssued from 'i18n/locales/en/issued.json';
import enAccounts from 'i18n/locales/en/accounts.json';
import enProfile from 'i18n/locales/en/profile.json';
import enNotifications from 'i18n/locales/en/notifications.json';
import enMessages from 'i18n/locales/en/messages.json';

import siCommon from 'i18n/locales/si/common.json';
import siNav from 'i18n/locales/si/nav.json';
import siShell from 'i18n/locales/si/shell.json';
import siDashboard from 'i18n/locales/si/dashboard.json';
import siAuth from 'i18n/locales/si/auth.json';
import siFiles from 'i18n/locales/si/files.json';
import siRequests from 'i18n/locales/si/requests.json';
import siStaffRequests from 'i18n/locales/si/staffRequests.json';
import siIssued from 'i18n/locales/si/issued.json';
import siAccounts from 'i18n/locales/si/accounts.json';
import siProfile from 'i18n/locales/si/profile.json';
import siNotifications from 'i18n/locales/si/notifications.json';
import siMessages from 'i18n/locales/si/messages.json';

import type { AppLanguage } from 'i18n/languages';

export const NAMESPACE_LIST = [
  'common',
  'nav',
  'shell',
  'dashboard',
  'auth',
  'files',
  'requests',
  'staffRequests',
  'issued',
  'accounts',
  'profile',
  'notifications',
  'messages',
] as const;

export type TranslationNamespace = (typeof NAMESPACE_LIST)[number];

export const DEFAULT_NAMESPACE: TranslationNamespace = 'common';

type NamespaceDictionary = Record<TranslationNamespace, object>;

export const resources: Record<AppLanguage, NamespaceDictionary> = {
  en: {
    common: enCommon,
    nav: enNav,
    shell: enShell,
    dashboard: enDashboard,
    auth: enAuth,
    files: enFiles,
    requests: enRequests,
    staffRequests: enStaffRequests,
    issued: enIssued,
    accounts: enAccounts,
    profile: enProfile,
    notifications: enNotifications,
    messages: enMessages,
  },
  si: {
    common: siCommon,
    nav: siNav,
    shell: siShell,
    dashboard: siDashboard,
    auth: siAuth,
    files: siFiles,
    requests: siRequests,
    staffRequests: siStaffRequests,
    issued: siIssued,
    accounts: siAccounts,
    profile: siProfile,
    notifications: siNotifications,
    messages: siMessages,
  },
};