import { handleListConnections } from '@/lib/mcp/handler'
import { defaultOAuthStore } from '@/lib/mcp/store'

// Apps connected to the person's gym data (Claude, ChatGPT). Used by the iPhone
// Settings screen. Bearer: the iPhone app's access token.
// 200: [{ "id", "clientName", "createdAt", "lastUsedAt" }]

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return handleListConnections(req, { store: defaultOAuthStore(), jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '' })
}
