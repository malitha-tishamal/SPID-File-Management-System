import { NextResponse } from 'next/server';
import { missingEnvMessage, validateServerEnv } from 'config/env';
import type { ApiErrorCode } from 'types/auth';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    extra?: Record<string, unknown>,
    headers?: Record<string, string>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status, headers });
}

/**
 * Wraps a route handler: converts thrown ApiErrors and missing-environment
 * configuration into clear JSON responses instead of misleading auth failures.
 */
export function withErrorHandling(
  handler: (req: Request, ctx: any) => Promise<NextResponse>
) {
  return async (req: Request, ctx: any): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err: any) {
      if (err instanceof ApiError) {
        return jsonError(err.status, err.code, err.message, err.extra, err.headers);
      }
      if (err instanceof Error && err.message.startsWith('Server configuration error')) {
        return jsonError(500, 'CONFIG_ERROR', err.message);
      }
      console.error('[api] Unhandled error:', err?.message || err);
      const msg = err?.message || '';
      if (msg) {
        const detail = msg.replace(/^[A-Za-z]+Repository\.\w+ error:\s*/, '');
        return jsonError(500, 'AUTH_ERROR', detail);
      }
      return jsonError(500, 'AUTH_ERROR', 'An unexpected server error occurred. Please try again.');
    }
  };
}

/** Throws a clear error when required env vars are absent. */
export function requireServerEnv(): void {
  const { valid, missing } = validateServerEnv();
  if (!valid) {
    throw new Error(missingEnvMessage(missing));
  }
}
