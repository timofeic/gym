import { approve, checkAuthorizeRequest, consentParamsToQuery, deny, verifyConsent } from '@/lib/mcp/oauth'
import { isValidTimeZone } from '@/lib/mcp/logic'
import { mcpDeps } from '@/lib/mcp/config'
import { webUser } from '@/lib/mcp/session'

// The consent form posts here. Checks the signed form, then sends the person
// back to Claude or ChatGPT with a one-time code (or "access_denied").

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const page = (message: string, status: number) =>
  new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Gym</title><p style="font-family:system-ui;padding:2rem">${message}</p>`, {
    status, headers: { 'content-type': 'text/html; charset=utf-8' },
  })

export async function POST(req: Request) {
  const deps = mcpDeps(req)
  const form = await req.formData().catch(() => null)
  if (!form) return page('Something went wrong. Go back to Claude or ChatGPT and connect again.', 400)
  const user = await webUser()
  if (!user) return page('You were signed out. Go back to Claude or ChatGPT and connect again.', 401)

  const params = verifyConsent(String(form.get('consent') ?? ''), user.id, deps.config.formSecret, Date.now())
  if (!params) return page('This page expired. Go back to Claude or ChatGPT and connect again.', 400)
  // The app could have been removed since the page loaded: check again.
  const check = await checkAuthorizeRequest(consentParamsToQuery(params), deps)
  if (!check.ok) return page('This connection request is no longer valid. Start again.', 400)

  const tz = String(form.get('timezone') ?? 'UTC')
  const target = form.get('decision') === 'allow'
    ? await approve(check.params, user.id, isValidTimeZone(tz) ? tz : 'UTC', deps)
    : deny(check.params, deps)
  return new Response(null, { status: 303, headers: { location: target, 'cache-control': 'no-store' } })
}
