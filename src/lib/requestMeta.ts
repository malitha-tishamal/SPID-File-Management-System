/** Request metadata used only for rate limiting and the security audit trail. */

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * First hop of `x-forwarded-for` (set by the reverse proxy), then the common
 * single-value headers. Never used for authorization decisions.
 */
export function getRequestMeta(req: Request): RequestMeta {
  const forwarded = req.headers.get('x-forwarded-for');
  const raw =
    forwarded?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    null;

  const ip = raw ? raw.replace(/^::ffff:/i, '').slice(0, 64) : null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;
  return { ip, userAgent };
}
