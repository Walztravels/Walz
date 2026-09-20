'use client'

/**
 * Walz Team Hub V1 — thin fetch wrapper for every client call this UI makes.
 *
 * On a 401 (the AdminSession cookie is gone/invalid) it redirects to
 * /admin/login exactly like the rest of the admin shell already does (see
 * app/admin/inbox/page.tsx's own router.push('/admin/login') convention on
 * a 401) and throws SessionExpiredError so calling code can stop quietly
 * instead of rendering a raw JSON error. Centralized here so every hook and
 * component gets the same behavior without needing a Next.js router
 * instance threaded through it.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired.')
    this.name = 'SessionExpiredError'
  }
}

export function isSessionExpiredError(e: unknown): e is SessionExpiredError {
  return e instanceof SessionExpiredError
}

export async function teamFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/admin/login'
    throw new SessionExpiredError()
  }
  return res
}

/** Best-effort error message extraction from a non-OK JSON API response. */
export async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return typeof data.error === 'string' && data.error.trim() ? data.error : fallback
  } catch {
    return fallback
  }
}
