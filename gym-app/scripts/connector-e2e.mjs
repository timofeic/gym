// End-to-end check of the gym connector over real HTTP, the way Claude or
// ChatGPT uses it: register, consent page, token, then the official MCP client.
//   node scripts/connector-e2e.mjs http://localhost:3032 <session-token>
// <session-token> is an Auth.js session (next_auth.sessions."sessionToken").
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const [base, session] = process.argv.slice(2)
const cookie = `authjs.session-token=${session}`
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const log = (...a) => console.log(...a)

const unauth = await fetch(`${base}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
const challenge = unauth.headers.get('www-authenticate')
log('1. MCP without token:', unauth.status, challenge)
const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge)[1]
const prm = await (await fetch(prmUrl)).json()
const as = await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()
log('2. Discovery: resource', prm.resource, '| issuer', as.issuer)

const reg = await (await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' }) })).json()
log('3. Registered client', reg.client_id)

const verifier = randomBytes(32).toString('base64url')
const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CALLBACK, state: 'xyz', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: prm.resource, scope: 'gym offline_access' })
const page = await fetch(`${as.authorization_endpoint}?${q}`, { headers: { cookie } })
const html = (await page.text()).replaceAll('<!-- -->', '')
const consent = /name="consent" value="([^"]+)"/.exec(html)?.[1]
log('4. Consent page:', page.status, html.includes('Allow Claude to use your gym data?') ? 'shows "Allow Claude to use your gym data?"' : 'NO CONSENT TEXT')
if (!consent) throw new Error('no consent form')

const decision = await fetch(`${base}/oauth/authorize/decision`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ consent, timezone: 'Australia/Melbourne', decision: 'allow' }) })
const back = new URL(decision.headers.get('location'))
log('5. Approved:', decision.status, '->', back.origin + back.pathname, '| state', back.searchParams.get('state'), '| iss', back.searchParams.get('iss'))

const tokRes = await fetch(as.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: verifier, client_id: reg.client_id, redirect_uri: CALLBACK, resource: prm.resource }) })
const tokens = await tokRes.json()
log('6. Token:', tokRes.status, tokens.token_type, 'expires_in', tokens.expires_in, 'refresh', !!tokens.refresh_token)

const client = new Client({ name: 'e2e', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(prm.resource), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }))
log('7. MCP connected, server', client.getServerVersion()?.name, 'protocol', client.transport?.protocolVersion ?? '')
const { tools } = await client.listTools()
log('   tools:', tools.map(t => `${t.name}${t.annotations?.readOnlyHint ? ' (read)' : t.annotations?.destructiveHint ? ' (destructive)' : ' (write)'}`).join(', '))
const text = r => r.content.map(c => c.text).join(' ')
log('8. workouts_on_date monday ->', text(await client.callTool({ name: 'workouts_on_date', arguments: { date: 'monday' } })))
log('9. log_workout bench 3x8 @60 ->', text(await client.callTool({ name: 'log_workout', arguments: { entries: [{ exercise: 'bench', sets: 3, reps: 8, weight: 60 }] } })))
log('10. recent_workouts ->', text(await client.callTool({ name: 'recent_workouts', arguments: { limit: 2 } })))
await client.close()
