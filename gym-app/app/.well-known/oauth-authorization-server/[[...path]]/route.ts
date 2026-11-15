import { authorizationServerMetadata } from '@/lib/mcp/oauth'
import { originFrom } from '@/lib/mcp/config'

// RFC 8414 authorisation server metadata. The issuer is this site's origin.

export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(originFrom(req.headers, req.url)), {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
}
