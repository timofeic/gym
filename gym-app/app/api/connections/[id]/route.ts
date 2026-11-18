import { handleDeleteConnection } from '@/lib/mcp/handler'
import { defaultOAuthStore } from '@/lib/mcp/store'

// Revokes one connected app. 204 on success, 404 if it isn't the caller's.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleDeleteConnection(req, id, { store: defaultOAuthStore(), jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '' })
}
