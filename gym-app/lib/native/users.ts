import { createClient } from '@supabase/supabase-js'
import type { NativeUser } from './tokens'

// Looks up people in next_auth.users, the table the web sign-in uses, so the
// phone and the web app share one user id.

export interface UserStore {
  findByEmail(email: string): Promise<NativeUser | null>
  findById(id: string): Promise<NativeUser | null>
  create(input: { email: string; name: string | null; image: string | null }): Promise<NativeUser>
  /** The user linked to a sign-in provider's account id (next_auth.accounts, as Auth.js stores it). */
  findByAccount(provider: string, providerAccountId: string): Promise<NativeUser | null>
  /** Links a provider account id to a user. Doing it twice is fine. */
  linkAccount(userId: string, provider: string, providerAccountId: string): Promise<void>
  /** Sets the name, only if the user has none yet. */
  fillName(userId: string, name: string): Promise<NativeUser | null>
  /** Removes the person and everything that is theirs. */
  deleteUser(userId: string): Promise<void>
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
    async findByAccount(provider, providerAccountId) {
      const { data, error } = await db
        .from('accounts')
        .select('users(id, email, name)')
        .eq('provider', provider)
        .eq('providerAccountId', providerAccountId)
        .maybeSingle()
      if (error) throw error
      const users = (data as { users: Row | Row[] | null } | null)?.users ?? null
      return pick(Array.isArray(users) ? users[0] ?? null : users)
    },
    async linkAccount(userId, provider, providerAccountId) {
      const { error } = await db
        .from('accounts')
        .upsert(
          { userId, type: 'oidc', provider, providerAccountId },
          { onConflict: 'provider,providerAccountId', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    async fillName(userId, name) {
      const { error } = await db.from('users').update({ name }).eq('id', userId).is('name', null)
      if (error) throw error
      return this.findById(userId)
    },
    async deleteUser(userId) {
      // Workouts (and their sets) first, then the person's own exercises, so
      // nothing still points at an exercise when it goes. Built-in exercises
      // (user_id null) are never touched. Sessions and linked accounts go with
      // the user row (on delete cascade).
      const app = db.schema('public')
      const steps = [
        () => app.from('workouts').delete().eq('user_id', userId),
        () => app.from('exercises').delete().eq('user_id', userId),
        () => db.from('users').delete().eq('id', userId),
      ]
      for (const step of steps) {
        const { error } = await step()
        if (error) throw error
      }
    },
  }
}

export function defaultUserStore(): UserStore {
  return supabaseUserStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
