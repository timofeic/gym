# Gym coach voice agent

The voice side of the iPhone app. It joins a LiveKit room when you tap "Talk to
coach", listens, and can log workouts, answer questions about your training,
suggest weights, run rest timers, and add or change exercises.

- Thinking: Claude Sonnet 5.5 (`claude-sonnet-5-5`), effort low for quick replies.
  Change it with the `LLM_MODEL` setting. The one place it's set is
  `gym_agent/claude_llm.py`.
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
| `ANTHROPIC_API_KEY` | Claude |
| `LLM_MODEL` | Optional, default `claude-sonnet-5-5` |

## Put it on LiveKit Cloud

```bash
brew install livekit-cli
lk cloud auth
lk agent create --secrets-file .env
```

Later changes: `lk agent deploy`. Logs: `lk agent logs`.

## Tests

```bash
uv run pytest
```

The tests never call Claude. One test captures the request the agent would send
and checks it follows Sonnet 5.5's rules. The `integration` tests run against local
Supabase (`../gym-app/scripts/localdb/localdb.sh start`, or `npx supabase@3.1.0 start` in `../gym-app`) and skip if it isn't running.
