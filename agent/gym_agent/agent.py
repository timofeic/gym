"""LiveKit entry point for the gym-coach voice agent.

Run locally:  uv run python -m gym_agent.agent dev
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli, function_tool, inference
from livekit.plugins import silero
from typing_extensions import TypedDict

from .claude_llm import ClaudeVoiceLLM
from .data import GymRepository
from .tools import CoachTools, encode_payload

load_dotenv()
log = logging.getLogger("gym-coach")

AGENT_NAME = "gym-coach"

INSTRUCTIONS = """You are a gym coach talking to the user through their phone while they train.
Speak like a friendly coach: short sentences, one or two at a time. No lists, no markdown, no emoji.
Weights are in kilograms. Say "kilos".

You can log workouts, answer questions about past training, suggest weights, run rest timers,
and add or change exercises and categories. Use the tools for anything about their data; never guess numbers.

Logging: before calling log_workout, read back what you will save in one sentence and wait for a yes.
If they correct you, update and confirm again. After saving, say so briefly.
If an exercise name is ambiguous or missing, ask which one they mean, or offer to add it.
Today's date and time is in the user's timezone: {today}. Use YYYY-MM-DD dates in tools.

Coaching: when they start a session or ask what to do, check recent workouts and weekly sets,
suggest a plan, and offer a rest timer between sets (usually 90 seconds, 2 to 3 minutes for heavy lifts).
Keep safety simple: good form over heavier weight."""


class LogEntry(TypedDict):
    exercise: str
    sets: int
    reps: int
    weight: float


class GymCoach(Agent):
    def __init__(self, tools: CoachTools, today: str) -> None:
        super().__init__(instructions=INSTRUCTIONS.format(today=today))
        self.coach = tools

    @function_tool
    async def list_exercises(self, category: str | None = None) -> str:
        """List exercises in the user's library, optionally only one category (eg Chest)."""
        return await self.coach.list_exercises(category)

    @function_tool
    async def list_categories(self) -> str:
        """List the exercise categories."""
        return await self.coach.list_categories()

    @function_tool
    async def log_workout(self, entries: list[LogEntry], date: str | None = None) -> str:
        """Save a workout. Only call after the user confirmed what you read back.

        Args:
            entries: one item per exercise: name as spoken, sets (1-10), reps (1-100), weight in kg (0-500).
            date: YYYY-MM-DD if not today.
        """
        return await self.coach.log_workout([dict(e) for e in entries], date)

    @function_tool
    async def recent_workouts(self, limit: int = 3) -> str:
        """The user's most recent workouts, newest first (limit 1-10)."""
        return await self.coach.recent_workouts(limit)

    @function_tool
    async def workouts_on(self, date: str) -> str:
        """Workouts on one day (YYYY-MM-DD, user's local date)."""
        return await self.coach.workouts_on(date)

    @function_tool
    async def exercise_history(self, exercise: str) -> str:
        """Recent sessions and trend for one exercise."""
        return await self.coach.exercise_history(exercise)

    @function_tool
    async def weekly_sets(self) -> str:
        """Sets per muscle group since Sunday."""
        return await self.coach.weekly_sets()

    @function_tool
    async def suggest_weight(self, exercise: str) -> str:
        """Suggest the next weight for an exercise from the user's history."""
        return await self.coach.suggest_weight(exercise)

    @function_tool
    async def start_rest_timer(self, seconds: int) -> str:
        """Start a rest timer (10-600 seconds). You will announce when it ends."""
        return await self.coach.start_rest_timer(seconds)

    @function_tool
    async def cancel_rest_timer(self) -> str:
        """Stop the current rest timer."""
        return "Timer stopped." if self.coach.cancel_rest_timer() else "No timer running."

    @function_tool
    async def add_exercise(
        self, name: str, categories: list[str], sets: int = 3, reps: int = 10, weight: float = 0
    ) -> str:
        """Add a new exercise to the user's library with default sets, reps and kg."""
        return await self.coach.add_exercise(name, categories, sets, reps, weight)

    @function_tool
    async def update_exercise(
        self,
        exercise: str,
        new_name: str | None = None,
        categories: list[str] | None = None,
        sets: int | None = None,
        reps: int | None = None,
        weight: float | None = None,
    ) -> str:
        """Change an exercise's name, categories, or default sets, reps and kg. Only pass what changes."""
        return await self.coach.update_exercise(exercise, new_name, categories, sets, reps, weight)

    @function_tool
    async def add_category(self, name: str) -> str:
        """Add an exercise category."""
        return await self.coach.add_category(name)


def timezone_from_metadata(metadata: str | None) -> ZoneInfo:
    try:
        name = (json.loads(metadata) if metadata else {}).get("timezone") or "UTC"
        return ZoneInfo(name)
    except (ValueError, ZoneInfoNotFoundError, AttributeError):
        return ZoneInfo("UTC")


def make_publisher(room: rtc.Room):
    async def publish(topic: str, payload: dict[str, Any]) -> None:
        await room.local_participant.publish_data(encode_payload(payload), reliable=True, topic=topic)

    return publish


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    # The sign-in service signed this pass, so the identity is the user id.
    user_id = participant.identity
    tz = timezone_from_metadata(participant.metadata)

    repo = GymRepository(
        supabase_url=os.environ["SUPABASE_URL"],
        anon_key=os.environ["SUPABASE_ANON_KEY"],
        jwt_secret=os.environ["SUPABASE_JWT_SECRET"],
        user_id=user_id,
    )
    ctx.add_shutdown_callback(repo.aclose)

    session = AgentSession(
        stt=inference.STT("deepgram/nova-3", language="en"),
        llm=ClaudeVoiceLLM(),
        tts=inference.TTS("cartesia/sonic-3"),
        vad=silero.VAD.load(),
    )
    coach_tools = CoachTools(repo, make_publisher(ctx.room), tz, say=lambda text: session.say(text))

    from datetime import datetime

    today = datetime.now(tz).strftime("%A %-d %B %Y, %H:%M (%Y-%m-%d)")
    await session.start(agent=GymCoach(coach_tools, today), room=ctx.room)
    await session.generate_reply(instructions="Greet the user in one short sentence and ask what they're training today.")


if __name__ == "__main__":
    cli.run_app(server)
