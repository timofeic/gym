"""Runs the real repository and tools against local Supabase (gym-app/supabase).

Start it with: gym-app/scripts/localdb/localdb.sh start (or npx supabase@3.1.0 start)
Skipped when it isn't running.
"""

import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from gym_agent.data import GymRepository
from gym_agent.tools import CoachTools

pytestmark = pytest.mark.integration

GYM_APP = Path(__file__).resolve().parents[2] / "gym-app"
USER = "11111111-1111-1111-1111-111111111111"
OTHER_USER = "99999999-9999-9999-9999-999999999999"


def _parse(text: str) -> dict[str, str]:
    env = {}
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip().removeprefix("export ")] = v.strip().strip('"')
    return env


def _local_env() -> dict[str, str]:
    """Docker-free stand-in first (gym-app/scripts/localdb), then `supabase status`."""
    standin = GYM_APP / ".localdb" / "env"
    if standin.exists():
        return _parse(standin.read_text())
    try:
        out = subprocess.run(
            ["npx", "--yes", "supabase@3.1.0", "status", "-o", "env"],
            cwd=GYM_APP, capture_output=True, text=True, timeout=60,
        ).stdout
    except Exception:
        return {}
    return _parse(out)


def _reachable(env: dict[str, str]) -> bool:
    try:
        r = httpx.get(f"{env['API_URL']}/rest/v1/", headers={"apikey": env["ANON_KEY"]}, timeout=3)
        return r.status_code < 500
    except Exception:
        return False


ENV = _local_env()
if not ENV.get("API_URL") or not ENV.get("JWT_SECRET") or not _reachable(ENV):
    pytest.skip("local Supabase is not running", allow_module_level=True)


def _repo(user=USER):
    return GymRepository(
        supabase_url=ENV["API_URL"], anon_key=ENV["ANON_KEY"], jwt_secret=ENV["JWT_SECRET"],
        user_id=user, client=httpx.AsyncClient(),
    )


class Room:
    def __init__(self):
        self.sent = []

    async def __call__(self, topic, payload):
        self.sent.append((topic, payload))


async def test_reads_seeded_library_and_history():
    repo = _repo()
    names = {e["name"] for e in await repo.all_exercises()}
    assert {"Bench Press", "Back Squat"} <= names
    hist = await repo.exercise_history("00000000-0000-0000-0000-0000000000a1")
    assert [h["weight"] for h in hist][:2] == [57.5, 60]
    await repo.aclose()


async def test_log_by_voice_lands_in_the_database():
    repo, room = _repo(), Room()
    tools = CoachTools(repo, room, ZoneInfo("Australia/Melbourne"))
    reply = await tools.log_workout([{"exercise": "deadlift", "sets": 3, "reps": 5, "weight": 105}])
    assert reply == "Saved: Deadlift, 3 sets of 5 at 105 kilos."
    latest = (await repo.recent_workouts(1))[0]
    entry = latest["workout_exercises"][0]
    assert entry["exercises"]["name"] == "Deadlift" and float(entry["weight"]) == 105
    assert room.sent == [("gym.data-changed", {"kind": "workouts"})]
    # Clean up: entries go with the workout (on delete cascade).
    r = await repo._client.delete(
        f"{ENV['API_URL']}/rest/v1/workouts", params={"id": f"eq.{latest['id']}"}, headers=repo._headers()
    )
    r.raise_for_status()
    assert latest["id"] not in {w["id"] for w in await repo.recent_workouts(10)}
    await repo.aclose()


async def test_another_user_cannot_see_this_users_workouts():
    repo = _repo(OTHER_USER)
    assert await repo.recent_workouts(10) == []
    await repo.aclose()
