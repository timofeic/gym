import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// Local testing only: lets the consent page sign in as a seeded test person
// without Google, so the connector can be tried through a tunnel against the
// local database. Off unless CONNECTOR_DEV_LOGIN_EMAIL is set, and never in production.

export function devLoginEmail(): string | null {
  const email = process.env.CONNECTOR_DEV_LOGIN_EMAIL
  return email && process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production' ? email : null
}

/** Makes an Auth.js database session for the test person and sets its cookie. */
export async function devSignIn(secure: boolean): Promise<void> {
  const email = devLoginEmail()
  if (!email) throw new Error('Dev login is off')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: 'next_auth' }, auth: { persistSession: false },
  })
  const { data: user, error } = await db.from('users').select('id').eq('email', email).single()
  if (error || !user) throw new Error('No test user with that email')
  const sessionToken = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000)
  const res = await db.from('sessions').insert({ sessionToken, userId: user.id, expires: expires.toISOString() })
  if (res.error) throw new Error(res.error.message)
  const name = secure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  ;(await cookies()).set(name, sessionToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', expires })
}
