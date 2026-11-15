import { protectedResourceMetadata } from '@/lib/mcp/oauth'
import { originFrom } from '@/lib/mcp/config'

// RFC 9728. Served at /.well-known/oauth-protected-resource and
// /.well-known/oauth-protected-resource/api/mcp (the path-specific form).

export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(originFrom(req.headers, req.url)), {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
}
