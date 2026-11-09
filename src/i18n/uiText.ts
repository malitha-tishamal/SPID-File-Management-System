/**
 * Translation for text that arrives from the server or from the shared
 * validators — done at the presentation layer, on purpose.
 *
 * API payloads, enum values, database records and the validator contracts in
 * `validators/authValidators.ts` stay exactly as they are (tests and other
 * systems read them). Only what is about to be painted on screen is looked up:
 * a known `ApiErrorCode` maps to a dictionary entry, a known canonical English
 * string maps to one, and anything unknown — including officer-typed content —
 * is rendered untouched. In English mode this returns the original string, so
 * switching on i18n cannot change any existing English message.
 */

import { currentLanguage, i18n } from 'i18n/config';
import { GOV_EMAIL_HINT } from 'validators/authValidators';

/** Canonical English strings produced by the shared validators. */
const VALIDATION_GLOSSARY: Record<string, string> = {
  'User role must be specified.': 'ROLE_REQUIRED',
  'Full legal name is required.': 'FULL_NAME_REQUIRED',
  'Full name must have at least 3 characters.': 'FULL_NAME_MIN',
  'Official work email is required.': 'EMAIL_REQUIRED',
  [`Please provide a valid email format (e.g. ${GOV_EMAIL_HINT}).`]: 'EMAIL_FORMAT',
  'Please select a section.': 'SECTION_REQUIRED',
  'Mobile phone number is required.': 'PHONE_REQUIRED',
  'Please enter a valid mobile number (7XXXXXXXX, 9 digits after +94).': 'PHONE_FORMAT',
  'Password is required.': 'PASSWORD_REQUIRED',
  'Password must be at least 8 characters.': 'PASSWORD_MIN',
  'Confirmation password is required.': 'CONFIRM_PASSWORD_REQUIRED',
  'Passwords do not match.': 'PASSWORD_MISMATCH',
  'Password is not strong enough. Use 8+ characters with uppercase, lowercase, a number and a special character.':
    'PASSWORD_NOT_STRONG',
};

/** Messages returned by API routes and controllers that carry no code of their own. */
const GENERIC_GLOSSARY: Record<string, string> = {
  'An action is required.': 'ACTION_REQUIRED',
  'Administrator privileges required.': 'ADMIN_PRIVILEGES_REQUIRED',
  'Authentication required.': 'AUTHENTICATION_REQUIRED',
  'Your account is awaiting administrator approval. Please contact the system administrator.': 'ACCOUNT_AWAITING_APPROVAL',
  'Your account has been disabled. Please contact the system administrator.': 'ACCOUNT_DISABLED_CONTACT',
  'An account with this email address already exists.': 'ACCOUNT_EMAIL_EXISTS',
  'Invalid account status value.': 'ACCOUNT_STATUS_INVALID',
  'Please enter your current password.': 'CURRENT_PASSWORD_REQUIRED',
  'Document not found or access denied.': 'DOCUMENT_NOT_FOUND',
  'Please provide a valid email address.': 'EMAIL_ADDRESS_INVALID',
  'Email and password are required.': 'EMAIL_PASSWORD_REQUIRED',
  'A valid email address is required.': 'EMAIL_VALID_REQUIRED',
  'Extension request not found.': 'EXTENSION_NOT_FOUND',
  'Provide a reason for the extension.': 'EXTENSION_REASON_REQUIRED',
  'Extension request rejected. The return date is unchanged.': 'EXTENSION_REJECTED',
  'Your extension request was sent for administrator approval.': 'EXTENSION_SENT',
  'Choose a valid extension status.': 'EXTENSION_STATUS_INVALID',
  'File deleted successfully.': 'FILE_DELETED',
  'File record has no internal ID.': 'FILE_ID_MISSING',
  'File Name is required.': 'FILE_NAME_REQUIRED',
  'File No is required.': 'FILE_NO_REQUIRED',
  'File record not found.': 'FILE_NOT_FOUND',
  'Your file request was cancelled.': 'FILE_REQUEST_CANCELLED',
  'File request not found.': 'FILE_REQUEST_NOT_FOUND',
  'Select a registered file.': 'FILE_SELECT_REQUIRED',
  'File updated successfully.': 'FILE_UPDATED',
  'An image file is required.': 'IMAGE_REQUIRED',
  'Invalid email or password.': 'INVALID_EMAIL_OR_PASSWORD',
  'Issued file not found.': 'ISSUED_FILE_NOT_FOUND',
  'You have no issued file with that reference.': 'ISSUED_FILE_NOT_YOURS',
  'Login successful.': 'LOGIN_SUCCESSFUL',
  'Notification id is required.': 'NOTIFICATION_ID_REQUIRED',
  'Not signed in.': 'NOT_SIGNED_IN',
  'No editable fields provided.': 'NO_EDITABLE_FIELDS',
  'You cannot change your own role or status.': 'OWN_ROLE_CHANGE_FORBIDDEN',
  'You cannot change your own role.': 'OWN_ROLE_CHANGE_FORBIDDEN_SHORT',
  'Password updated successfully. You can now sign in.': 'PASSWORD_UPDATED',
  'The primary administrator account is protected.': 'PRIMARY_ADMIN_PROTECTED',
  'Failed to create user profile record.': 'PROFILE_CREATE_FAILED',
  'Profile details updated successfully.': 'PROFILE_DETAILS_UPDATED',
  'Profile image must be JPEG, PNG, WebP or GIF.': 'PROFILE_IMAGE_FORMAT',
  'Profile image uploaded successfully.': 'PROFILE_IMAGE_UPLOADED',
  'Profile picture removed successfully.': 'PROFILE_PICTURE_REMOVED',
  'Your account registration was declined. Please contact the system administrator.': 'REGISTRATION_DECLINED',
  'Invalid request body.': 'REQUEST_BODY_INVALID',
  'Request body is required.': 'REQUEST_BODY_REQUIRED',
  'Invalid request ID.': 'REQUEST_ID_INVALID',
  'Invalid role value.': 'ROLE_INVALID',
  'Invalid role selection.': 'ROLE_SELECTION_INVALID',
  'Invalid section ID.': 'SECTION_ID_INVALID',
  'Section is required.': 'SECTION_REQUIRED_SHORT',
  'The selected section is not recognized.': 'SECTION_UNRECOGNISED',
  'Staff privileges required.': 'STAFF_PRIVILEGES_REQUIRED',
  'Invalid status value.': 'STATUS_INVALID',
};

function translate(bucket: 'codes' | 'validation' | 'generic', key: string, vars?: Record<string, unknown>): string {
  const path = `messages:${bucket}.${key}`;
  if (!i18n.exists(path)) return '';
  return String(i18n.t(path, vars));
}

/**
 * A message the UI is about to show. Pass the API `code` when you have one —
 * the code is machine-readable and stable, the English text is not.
 */
export function localiseMessage(
  message?: string | null,
  options?: { code?: string | null; vars?: Record<string, unknown> }
): string {
  const original = typeof message === 'string' ? message.trim() : '';
  if (currentLanguage() === 'en') return message ?? '';
  if (!original && !options?.code) return message ?? '';

  if (options?.code) {
    const byCode = translate('codes', options.code, options.vars);
    if (byCode) return byCode;
  }

  if (original) {
    const validationKey = VALIDATION_GLOSSARY[original];
    if (validationKey) {
      const hit = translate('validation', validationKey, { email: GOV_EMAIL_HINT, ...options?.vars });
      if (hit) return hit;
    }
    const genericKey = GENERIC_GLOSSARY[original];
    if (genericKey) {
      const hit = translate('generic', genericKey, options?.vars);
      if (hit) return hit;
    }
  }

  // Unknown text (officer-typed names, notes, new server copy): show it as-is.
  return message ?? '';
}

/** Field-level validation errors: `{ email: 'Official work email is required.' }`. */
export function localiseFieldErrors(errors: Record<string, string> | null | undefined): Record<string, string> {
  if (!errors) return {};
  if (currentLanguage() === 'en') return errors;
  const out: Record<string, string> = {};
  Object.entries(errors).forEach(([field, message]) => {
    out[field] = localiseMessage(message);
  });
  return out;
}

/**
 * The return-date badge text from `getReturnStatus`.
 *
 * The helper in `lib/returnStatus.ts` keeps producing its English label — the
 * status itself is what other code reads — so only the painted badge is
 * re-worded here, keyed off the machine-readable status plus the day count
 * rather than by parsing English prose.
 */
export function localiseReturnStatusLabel(result: {
  status: string;
  label: string;
  daysRemaining: number | null;
}): string {
  if (currentLanguage() === 'en') return result.label;
  const days = result.daysRemaining;
  let key = 'noDate';
  let vars: Record<string, unknown> | undefined;
  if (result.status === 'returned') key = 'returned';
  else if (result.status === 'due_today') key = 'dueToday';
  else if (result.status === 'overdue') {
    key = 'overdueBy';
    vars = { count: Math.abs(days ?? 0) };
  } else if (typeof days === 'number') {
    key = 'remaining';
    vars = { count: days };
  }
  const path = `messages:returnStatus.${key}`;
  if (!i18n.exists(path, vars)) return result.label;
  return String(i18n.t(path, vars));
}

export default localiseMessage;
