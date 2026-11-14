import type { OAuthConfig } from './oauth'
import { defaultOAuthStore } from './store'
import type { McpDeps } from './handler'

// Reads settings from the environment for the Next.js routes.

/** Public origin of this deployment. CONNECTOR_ORIGIN wins; otherwise the host the request came to. */
export function originFrom(headers: Headers, fallbackUrl?: string): string {
  const fixed = process.env.CONNECTOR_ORIGIN?.replace(/\/$/, '')
  if (fixed) return fixed
  const host = headers.get('x-forwarded-host')?.split(',')[0].trim() || headers.get('host')
  if (host) {
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    const proto = headers.get('x-forwarded-proto')?.split(',')[0].trim() || (local ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return new URL(fallbackUrl ?? 'http://localhost:3000').origin
}

export function oauthConfig(origin: string): OAuthConfig {
  const formSecret = process.env.AUTH_SECRET
  if (!formSecret) throw new Error('AUTH_SECRET is not set')
  return { origin, formSecret }
}

export function mcpDeps(req: Request): McpDeps {
  const origin = originFrom(req.headers, req.url)
  return {
    config: oauthConfig(origin),
    store: defaultOAuthStore(),
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      jwtSecret: process.env.SUPABASE_JWT_SECRET!,
    },
  }
}
