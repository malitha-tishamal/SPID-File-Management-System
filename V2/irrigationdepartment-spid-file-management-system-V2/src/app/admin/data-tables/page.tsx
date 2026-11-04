import { redirect } from 'next/navigation';

/**
 * The old Data Tables route was a ChakraUI starter demo with fixture rows.
 * It has been replaced by the real, database-backed Issued Files ledger, so the
 * legacy URL now forwards there instead of rendering sample tables.
 */
export default function LegacyDataTablesRedirect() {
  redirect('/admin/issued-files');
}
