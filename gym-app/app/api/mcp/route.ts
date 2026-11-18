import { handleMcp } from '@/lib/mcp/handler'
import { mcpDeps } from '@/lib/mcp/config'

// The gym connector's MCP endpoint (Streamable HTTP, stateless). See docs/connector.md.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const handle = (req: Request) => handleMcp(req, mcpDeps(req))
export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS }
