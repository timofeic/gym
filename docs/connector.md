# Gym connector for Claude and ChatGPT

People can talk to their gym data from their own Claude or ChatGPT app, on
their own plan. Gym pays no model bill: the thinking and the voice happen in
Claude or ChatGPT. Gym only answers tool calls.

The connector is a remote MCP server at:

```txt
https://<your gym site>/api/mcp
```

## Add it to Claude

Works on Free (one custom connector), Pro, Max, Team and Enterprise. Once added
on the web it also shows in the Claude desktop and iPhone apps, including voice
mode.

1. In Claude, go to **Customize > Connectors**, then **Add > Add custom connector**.
2. Name: `Gym`. URL: `https://<your gym site>/api/mcp`. Click **Continue**, keep
   the options marked **Detected**, then **Add**.
3. Click **Connect**. A Gym page opens: sign in with Google (the same account
   you use for Gym), then press **Allow**.
4. In a chat, ask "What did I do last Monday?" or "Log bench, 3 sets of 8 at 60".
   Claude asks before running a tool that saves anything.

On Team and Enterprise, an Owner adds it under **Organisation settings >
Connectors**, then each person clicks **Connect**.

## Add it to ChatGPT

Needs Developer mode, which is on the web for Plus, Pro, Business, Enterprise
and Education. OpenAI's own pages disagree on whether Plus and Pro can use
tools that save data, so logging may only work on Business and up for now.

1. **Settings > Apps & Connectors > Advanced settings**: turn on **Developer mode**.
2. **Settings > Apps & Connectors > Create** (or **Add app**). Name `Gym`, URL
   `https://<your gym site>/api/mcp`, authentication **OAuth**. Tick that you
   trust it, then **Create**.
3. Sign in with Google on the Gym page and press **Allow**.
4. In a new chat, pick Gym from the **+** menu (Developer mode) and ask a question.

## Disconnect

Any of these stops access straight away:

- Gym iPhone app: **Settings > Connected apps**, swipe to remove.
- Claude: **Customize > Connectors > Gym > Disconnect** (or Remove).
- ChatGPT: **Settings > Apps & Connectors > Gym > Disconnect**.

Disconnecting in Claude or ChatGPT throws away their keys. Removing it in the
Gym app also cancels the keys on our side.

## What it can do

| Tool | What it does | Hint |
| - | - | - |
| `list_exercises` | Exercise library, optionally by category | read only |
| `recent_workouts` | Latest workouts, newest first | read only |
| `workouts_on_date` | One day, in your timezone ("monday" = the last one) | read only |
| `exercise_history` | Every session of one exercise, trend, heaviest | read only |
| `weekly_sets_per_muscle` | Sets per category since Sunday, no Upper/Lower/Push/Pull | read only |
| `suggest_next_weight` | +2.5 kg after hitting target reps twice running | read only |
| `list_categories` | Categories | read only |
| `log_workout` | Save a workout. Sets 1 to 10, reps 1 to 100, weight 0 to 500 kg | write |
| `add_exercise` | New exercise, unique name | write |
| `update_exercise` | Change one. Built-ins get a personal copy | write, destructive |
| `add_category` | New category (shared by everyone) | write |

Nothing can be deleted through the connector. The rules are the same as the app
and the voice coach (`gym-app/lib/mcp/logic.ts` is a port of
`agent/gym_agent/logic.py`; keep them in step).

## How it works

```txt
Claude / ChatGPT ──► POST /api/mcp (Bearer gym_at_…)
                      ├─ token checked in oauth_tokens (hash, expiry, audience, not revoked)
                      ├─ 5 minute Supabase token minted for that user
                      └─ tools query Supabase as that user, so row level security applies
```

- **MCP**: Streamable HTTP, stateless, JSON responses, official TypeScript SDK
  (`@modelcontextprotocol/sdk` 1.32). It speaks protocol versions up to
  `2025-11-25`. The newer `2026-07-28` revision is stateless with no
  `initialize`; clients that speak both fall back to `2025-11-25` on our 400,
  as that spec describes. Move to the SDK's modern mode when it ships.
- **OAuth 2.1** (MCP authorization spec):
  - `/.well-known/oauth-protected-resource/api/mcp` (RFC 9728). The 401 from
    `/api/mcp` points at it in `WWW-Authenticate`.
  - `/.well-known/oauth-authorization-server` (RFC 8414). The issuer is the site origin.
  - `/oauth/register`: dynamic client registration (RFC 7591). Public clients by
    default; a secret if the client asks for `client_secret_post`/`_basic`.
  - Client ID metadata documents: an `https://` `client_id` is fetched and
    checked (this is what "Use Claude's published identity" uses).
  - `/oauth/authorize`: the sign-in and consent page (Auth.js Google session).
    PKCE S256 only. `resource` must be this server. Every redirect carries
    `iss` (RFC 9207). Loopback redirects match on any port (Claude Code).
  - `/oauth/token`: authorisation code and refresh token grants. Access tokens
    last 1 hour, refresh tokens 90 days and rotate on every use. A reused code
    cuts off the connection it made.
  - `/oauth/revoke` (RFC 7009) removes the connection.
- **Storage**: migration `20261114_connector_oauth.sql`. Tables `oauth_clients`,
  `oauth_connections`, `oauth_codes`, `oauth_tokens`. Codes and tokens are
  SHA-256 hashes. Row level security is on with no policies, so only the
  service role reads them.
- **Timezone**: the consent page saves the browser's timezone on the
  connection. Tools take an optional `timezone` to override it.

### Connected apps API (for the iPhone app)

Bearer: the iPhone app's access token from `/api/native/session`.

- `GET /api/connections` → `200 [{ "id", "clientName", "createdAt", "lastUsedAt" }]`
- `DELETE /api/connections/{id}` → `204`, or `404` if it isn't yours.

## Going live

1. Apply `gym-app/supabase/migrations/20261114_connector_oauth.sql` to the
   production Supabase project.
2. Vercel env: `AUTH_SECRET` (already set) signs the consent form. Optional:
   `CONNECTOR_ORIGIN` to pin the issuer to one domain (otherwise it's the host
   the request came to), `NEXT_PUBLIC_PRIVACY_CONTACT` for the privacy page.
3. Deploy. The production Google OAuth client already allows the site's
   `/api/auth/callback/google`, which the consent page uses.

Preview deployments work for testing only if Vercel Deployment Protection is
off for them (Claude and ChatGPT can't get past it) and their URL is allowed
in the Google OAuth client.

## Testing

- `cd gym-app && npx vitest run lib/mcp`: rules, every tool, the OAuth flow,
  row level security and revoking, against the local database
  (`scripts/localdb/localdb.sh start`).
- `node gym-app/scripts/connector-e2e.mjs <base url> <session token>`: the full
  flow over HTTP with the official MCP client, the way Claude does it.
- MCP Inspector: `npx @modelcontextprotocol/inspector`, Streamable HTTP, URL above.
- Trying it in Claude against the local database: run the app locally, expose
  it with `cloudflared tunnel --url http://localhost:3000`, and set
  `CONNECTOR_DEV_LOGIN_EMAIL=lifter@example.test` in `.env.local`. The consent
  page then shows "Continue as lifter@example.test (local test only)", since
  Google sign-in won't accept a tunnel address. It's ignored in production.
  Dev mode compiles routes on first use, which can exceed Claude's 10 second
  limit on a busy machine: load each route once before connecting.

## Listing it in the directories

### Claude Connectors Directory

Submit at [claude.ai/directory/manage](https://claude.ai/directory/manage) >
**Submit new > MCP connector** (any paid plan). Needs:

- A public `https://` URL (production, not a tunnel).
- Every tool with a `title` and `readOnlyHint` or `destructiveHint`. Done.
- OAuth that works for Claude's client (DCR or CIMD). Done.
- Documentation URL (this page, published), privacy policy URL (`/privacy`),
  support contact, an icon, name, one-liner, description, categories.
- Confirming you ran every tool in Claude as a custom connector.
- Seven policy acknowledgements. It's listed as a Community connector after
  an automatic scan; Verified review asks for a test account by email.

Directory guidance prefers CIMD over DCR for busy servers, because DCR adds a
client row per connection. We support both.

### ChatGPT app directory

Submit through the OpenAI Platform dashboard. Needs:

- A verified individual or organisation on the OpenAI Platform.
- Privacy policy (data, purposes, recipients, retention, controls) and a
  support contact.
- `readOnlyHint`, `destructiveHint` and `openWorldHint` set to explicit true or
  false on every tool. Done.
- **A demo login and password** with sample data. Gym only has Google and
  Apple sign-in, so make a dedicated Google account for reviewers (no 2FA
  prompts they can't pass) and give it sample workouts.
- Works on desktop and mobile.

## Sources

- MCP authorization spec 2026-07-28: <https://modelcontextprotocol.io/specification/latest/basic/authorization>
- Claude custom connectors: <https://claude.com/docs/connectors/custom>
- Claude connector authentication: <https://claude.com/docs/connectors/building/authentication.md>
- Claude directory submission: <https://claude.com/docs/connectors/building/submission.md>
- ChatGPT Apps SDK auth: <https://developers.openai.com/apps-sdk/build/auth>
- ChatGPT submission guidelines: <https://developers.openai.com/apps-sdk/app-submission-guidelines>
- ChatGPT Developer mode: <https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt>
