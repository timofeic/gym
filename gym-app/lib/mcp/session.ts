import { auth } from '@/auth'
import { verifySupabaseToken } from '@/lib/native/tokens'

/** The person signed in to the website (Auth.js), or null. */
export async function webUser(): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const session = await auth()
  const token = session?.supabaseAccessToken
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!token || !secret) return null
  const claims = await verifySupabaseToken(token, secret)
  if (!claims) return null
  return { id: claims.userId, email: session?.user?.email ?? claims.email ?? null, name: session?.user?.name ?? null }
}
