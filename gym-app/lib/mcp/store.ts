import { createClient } from '@supabase/supabase-js'

// OAuth storage for the connector. Uses the service role: these tables have
// row level security with no policies, so nobody else can read them.

export type ClientRow = {
  id: string
  client_name: string
  redirect_uris: string[]
  kind: 'dcr' | 'cimd'
  client_secret_hash: string | null
  created_at?: string
}

export type CodeRow = {
  code_hash: string
  client_id: string
  user_id: string
  redirect_uri: string
  code_challenge: string
  scope: string
  resource: string
  timezone: string
  expires_at: string
  used_at?: string | null
}

export type ConnectionRow = {
  id: string
  user_id: string
  client_id: string
  client_name: string
  scope: string
  timezone: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type TokenRow = {
  token_hash: string
  kind: 'access' | 'refresh'
  connection_id: string
  resource: string
  expires_at: string
  used_at: string | null
}

export interface OAuthStore {
  getClient(id: string): Promise<ClientRow | null>
  saveClient(row: ClientRow): Promise<void>
  saveCode(row: CodeRow): Promise<void>
  /** Marks the code used and returns it, or null if it was already used or doesn't exist. */
  takeCode(codeHash: string): Promise<CodeRow | null>
  /** Was this code hash issued before (used or not)? */
  codeExists(codeHash: string): Promise<{ client_id: string; user_id: string } | null>
  findActiveConnection(userId: string, clientId: string): Promise<ConnectionRow | null>
  createConnection(row: Omit<ConnectionRow, 'id' | 'created_at' | 'last_used_at' | 'revoked_at'>): Promise<ConnectionRow>
  updateConnection(id: string, patch: Partial<ConnectionRow>): Promise<void>
  getConnection(id: string): Promise<ConnectionRow | null>
  listConnections(userId: string): Promise<ConnectionRow[]>
  saveToken(row: Omit<TokenRow, 'used_at'>): Promise<void>
  getToken(hash: string): Promise<TokenRow | null>
  /** Marks a refresh token used; null if it was already used. */
  takeRefreshToken(hash: string): Promise<TokenRow | null>
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export function supabaseOAuthStore(url: string, serviceRoleKey: string): OAuthStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = () => new Date().toISOString()

  return {
    async getClient(id) {
      return must(await db.from('oauth_clients').select('*').eq('id', id).maybeSingle())
    },
    async saveClient(row) {
      must(await db.from('oauth_clients').upsert(row))
    },
    async saveCode(row) {
      must(await db.from('oauth_codes').insert(row))
    },
    async takeCode(codeHash) {
      const rows = must(await db.from('oauth_codes').update({ used_at: now() })
        .eq('code_hash', codeHash).is('used_at', null).select('*'))
      return rows[0] ?? null
    },
    async codeExists(codeHash) {
      return must(await db.from('oauth_codes').select('client_id,user_id').eq('code_hash', codeHash).maybeSingle())
    },
    async findActiveConnection(userId, clientId) {
      const rows = must(await db.from('oauth_connections').select('*')
        .eq('user_id', userId).eq('client_id', clientId).is('revoked_at', null).limit(1))
      return rows[0] ?? null
    },
    async createConnection(row) {
      return must(await db.from('oauth_connections').insert(row).select('*').single())
    },
    async updateConnection(id, patch) {
      must(await db.from('oauth_connections').update(patch).eq('id', id))
    },
    async getConnection(id) {
      return must(await db.from('oauth_connections').select('*').eq('id', id).maybeSingle())
    },
    async listConnections(userId) {
      return must(await db.from('oauth_connections').select('*')
        .eq('user_id', userId).is('revoked_at', null).order('created_at', { ascending: false }))
    },
    async saveToken(row) {
      must(await db.from('oauth_tokens').insert(row))
    },
    async getToken(hash) {
      return must(await db.from('oauth_tokens').select('*').eq('token_hash', hash).maybeSingle())
    },
    async takeRefreshToken(hash) {
      const rows = must(await db.from('oauth_tokens').update({ used_at: now() })
        .eq('token_hash', hash).eq('kind', 'refresh').is('used_at', null).select('*'))
      return rows[0] ?? null
    },
  }
}

export function defaultOAuthStore(): OAuthStore {
  return supabaseOAuthStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
