import { handleRegister } from '@/lib/mcp/oauth'
import { mcpDeps } from '@/lib/mcp/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
}

export async function POST(req: Request) {
  const res = await handleRegister(req, mcpDeps(req))
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v)
  return res
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
