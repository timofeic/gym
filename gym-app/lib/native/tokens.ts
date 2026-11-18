import { SignJWT, jwtVerify } from 'jose'

// Supabase access tokens for the native app. Same claims the web app puts in
// session.supabaseAccessToken (see auth.ts), so row level security sees the
// same user id either way.

export type NativeUser = { id: string; email: string; name: string | null }

export const NATIVE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

function key(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function signSupabaseToken(
  user: NativeUser,
  secret: string,
  ttlSeconds = NATIVE_TOKEN_TTL_SECONDS,
  now = Math.floor(Date.now() / 1000),
): Promise<{ accessToken: string; expiresAt: number }> {
  const expiresAt = now + ttlSeconds
  const accessToken = await new SignJWT({ email: user.email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(key(secret))
  return { accessToken, expiresAt }
}

/** Returns the user id (`sub`) if the token is ours and still valid, else null. */
export async function verifySupabaseToken(token: string, secret: string): Promise<{ userId: string; email?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ['HS256'],
      audience: 'authenticated',
    })
    if (payload.role !== 'authenticated' || typeof payload.sub !== 'string') return null
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
  } catch {
    return null
  }
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}
