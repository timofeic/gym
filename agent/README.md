# Gym coach voice agent

The voice side of the iPhone app. It joins a LiveKit room when you tap "Talk to
coach", listens, and can log workouts, answer questions about your training,
suggest weights, run rest timers, and add or change exercises.

- Thinking: Claude Haiku 5.5 (`claude-haiku-5-5`), effort low for quick replies.
  Change it with the `LLM_MODEL` setting. The one place it's set is
  `gym_agent/claude_llm.py`. If Claude declines a request, the coach says a
  short sorry instead of going quiet.
- Listening and speaking: LiveKit Inference (Deepgram in, Cartesia out). No extra
  accounts; it bills to your LiveKit Cloud project.
- Data: your Supabase database, acting as the signed-in user, so it can only
  see that person's workouts.

How the parts fit: `../docs/native-architecture.md`.

## Run it on your Mac

```bash
cp .env.example .env    # then fill it in
uv sync
uv run python -m gym_agent.agent download-files
uv run python -m gym_agent.agent dev
```

The agent waits for the app to ask for it (it's named `gym-coach`).

## Settings

| Name | What |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud project keys |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` | Same Supabase project as the web app |
| `ANTHROPIC_API_KEY` | Claude. Set a monthly spend limit on this key in the Anthropic Console |
| `LLM_MODEL` | Optional, default `claude-haiku-5-5` |

## Put it on LiveKit Cloud

It runs on LiveKit Cloud as agent `gym-coach` in region `us-east` (close to
Claude and LiveKit Inference, which matters more than distance to the phone).
LiveKit builds the image from the `Dockerfile` on its own servers, so Docker
doesn't need to work on your Mac. `.dockerignore` keeps `.env` and `.venv` out
of the upload.

All commands run from this `agent/` folder.

### One-time setup

```bash
brew install livekit-cli
```

Link the CLI to the project. Either sign in with a browser:

```bash
lk cloud auth
```

or, with no browser (this is what we did), use the project keys from `.env`:

```bash
set -a; . ./.env; set +a
lk project add gym --url "$LIVEKIT_URL" --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" --default
```

Fill in `.env` (see Settings above), pointing at production Supabase. LiveKit
Cloud supplies its own `LIVEKIT_*` values, so it quietly drops those from the
secrets. Then:

```bash
lk agent create --region us-east --secrets-file .env .
```

This uploads the folder, builds it, starts it, and writes `livekit.toml` with
the agent's id. That file is committed so later commands know which agent.

### Ship a change

```bash
lk agent deploy .
```

It builds the new version and swaps it in once it's healthy. Check with
`lk agent status`. If something goes wrong, `lk agent rollback`.

### Change a secret

Edit `.env`, then:

```bash
lk agent update-secrets --secrets-file .env
```

This restarts the agent. `lk agent secrets` lists the names (not the values).

### Logs

```bash
lk agent logs                  # live logs from the running agent
lk agent logs --log-type build # build logs for the current version
```

Each conversation also has its own transcript and logs in the LiveKit Cloud
dashboard under Agents > gym-coach > Sessions.

### Check it really answers

```bash
uv run python scripts/voice_check.py
```

This joins a room the same way the iPhone app does, as a throwaway user, and
types to the coach instead of talking. It asks the coach to log squats 5 by 5
at 100 kg, says yes, and waits for the `gym.data-changed` message. Then it
reads the workout back from Supabase and deletes the throwaway user (which
deletes their workout too). Add `--keep` to leave them. It reads the Supabase
service role key from `../gym-app/.env.local`, so that key never goes into the
agent's secrets.

## Tests

```bash
uv run pytest
```

The tests never call Claude. One test captures the request the agent would send
and checks it follows Haiku 5.5's rules. The `integration` tests run against local
Supabase (`../gym-app/scripts/localdb/localdb.sh start`, or `npx supabase@3.1.0 start` in `../gym-app`) and skip if it isn't running.
