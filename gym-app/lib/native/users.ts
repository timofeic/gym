import { createClient } from '@supabase/supabase-js'
import type { NativeUser } from './tokens'

// Looks up people in next_auth.users, the table the web sign-in uses, so the
// phone and the web app share one user id.

export interface UserStore {
  findByEmail(email: string): Promise<NativeUser | null>
  findById(id: string): Promise<NativeUser | null>
  create(input: { email: string; name: string | null; image: string | null }): Promise<NativeUser>
}

type Row = { id: string; email: string; name: string | null }

export function supabaseUserStore(url: string, serviceRoleKey: string): UserStore {
  const db = createClient(url, serviceRoleKey, {
    db: { schema: 'next_auth' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const pick = (row: Row | null): NativeUser | null => (row ? { id: row.id, email: row.email, name: row.name } : null)

  return {
    async findByEmail(email) {
      const { data, error } = await db.from('users').select('id, email, name').ilike('email', email).maybeSingle()
      if (error) throw error
      return pick(data)
    },
    async findById(id) {
      const { data, error } = await db.from('users').select('id, email, name').eq('id', id).maybeSingle()
      if (error) throw error
      return pick(data)
    },
    async create({ email, name, image }) {
      const { data, error } = await db
        .from('users')
        .insert({ email, name, image, emailVerified: new Date().toISOString() })
        .select('id, email, name')
        .single()
      if (error) throw error
      return pick(data)!
    },
  }
}

export function defaultUserStore(): UserStore {
  return supabaseUserStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
