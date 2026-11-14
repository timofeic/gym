# Native iPhone app + voice coach

Three parts share one Supabase database:

```txt
iPhone app (SwiftUI, ios/)
  ├─ Google sign-in ──► sign-in service (Next.js API routes, gym-app/app/api/native/*)
  │                       └─ returns a Supabase access token for the same next_auth user
  ├─ reads/writes Supabase directly with that token (row level security applies)
  └─ "Talk to coach" ──► sign-in service /voice-token ──► LiveKit Cloud room
                                                           └─ voice agent "gym-coach" (agent/)
                                                                └─ reads/writes Supabase as that user
```

## Why this shape

- The web app signs people in with Auth.js and stores users in `next_auth.users`.
  Workouts point at those ids. Keeping that id means no data has to move.
- The sign-in service is three routes added to the existing Next.js app, which
  is already deployed on Vercel with the Supabase secrets.
- The LiveKit pass is signed by our service, so the agent can trust the
  participant identity (the user id) and act as that user.

## Sign-in service

All JSON. Errors are `{ "error": "<message>" }`.

### `POST /api/native/session`

Body: `{ "idToken": "<Google ID token from the iOS Google Sign-In SDK>" }`

Checks the token against Google's keys, issuer `accounts.google.com`, and an
audience in `AUTH_GOOGLE_ID` or `GOOGLE_IOS_CLIENT_ID`. Finds the
`next_auth.users` row by email, or creates it (same as the web adapter would).

200: `{ "accessToken": "<HS256 JWT>", "expiresAt": <unix seconds>, "user": { "id", "email", "name" } }`

The access token has `sub` = user id, `role` = `authenticated`,
`aud` = `authenticated`, 7 day expiry, signed with `SUPABASE_JWT_SECRET`.

### `POST /api/native/dev-session`

Body: `{ "email": "lifter@example.test" }`. Same response. Only works when
`NATIVE_DEV_LOGIN=true` and not in production; otherwise 404. Used by local
tests and the simulator before Google is configured. The user must exist.

### `POST /api/native/voice-token`

Header: `Authorization: Bearer <accessToken>`. Body (optional): `{ "timezone": "Australia/Melbourne" }`

200: `{ "serverUrl": "wss://...", "roomName": "...", "participantToken": "<LiveKit JWT>" }`

The LiveKit pass: identity = user id, name = user name, metadata =
`{"timezone": "..."}`, 15 minute expiry, and a room config that dispatches
the agent named `gym-coach`.

## Voice agent (`agent/`)

Python, `livekit-agents`. Agent name `gym-coach`. Claude Sonnet 5.5 does the thinking,
LiveKit Inference does speech in and out.

- Trusts the remote participant identity as the user id.
- Makes its own 1 hour Supabase token for that user (same claims as above),
  so row level security still limits it to that user's data.
- After any write it sends a data message on topic `gym.data-changed`,
  payload `{"kind": "workouts" | "exercises" | "categories"}`. The app reloads.
- Rest timer: sends topic `gym.rest-timer`, payload `{"seconds": N}`. The app
  shows a countdown; the agent speaks when time is up.

Env: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `ANTHROPIC_API_KEY`.

## Rules carried over from the web app

- Weights are kilograms.
- Limits when logging: sets 1 to 10, reps 1 to 100, weight 0 to 500.
- Exercises a user sees: their own, plus built-in ones they have not replaced.
  Editing a built-in exercise makes a personal copy with `parent_exercise_id`
  set; "reset to default" deletes the copy.
- Duplicate names: compare trimmed, lower case, single-spaced names.
- Weekly sets per category: week starts Sunday (local time), skip the
  categories Upper, Lower, Push, Pull.
- An exercise used in any workout can't be deleted.
- Renaming or deleting a category updates every exercise that uses it.
