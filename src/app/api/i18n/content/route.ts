import { ApiError, jsonOk, requireServerEnv, withErrorHandling } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import {
  TranslationService,
  TRANSLATION_TARGET,
  isTranslatable,
} from 'services/TranslationService';

export const dynamic = 'force-dynamic';

const MAX_TEXTS = 200;

/**
 * POST /api/i18n/content — translate database content for display.
 *
 * Only the target language is accepted; the source is always the English value
 * the officer typed, and the response is a plain source→translation map. The
 * provider key never leaves the server, and the response is cacheable by the
 * caller (the client keeps its own module-level cache).
 */
export const POST = withErrorHandling(async (req: Request) => {
  requireServerEnv();
  await AuthorizationService.requireApprovedProfile();

  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A JSON body is required.');
  }

  const language = body?.language ?? TRANSLATION_TARGET;
  if (language !== TRANSLATION_TARGET) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported translation language.');
  }

  const texts: unknown = body?.texts;
  if (!Array.isArray(texts) || texts.length > MAX_TEXTS) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Send between 1 and ${MAX_TEXTS} text values.`,
    );
  }

  const candidates = texts.filter(
    (text): text is string => typeof text === 'string' && isTranslatable(text),
  );
  if (candidates.length === 0) {
    return jsonOk({ translations: {}, language });
  }

  const service = new TranslationService(getSupabaseAdminClient());
  const translations = await service.translateMany(candidates, TRANSLATION_TARGET);

  return jsonOk({ translations, language });
});
