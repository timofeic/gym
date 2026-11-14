"""The coach's tools, with a fake database and a fake room."""

import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from gym_agent.tools import TOPIC_DATA_CHANGED, TOPIC_REST_TIMER, CoachTools

USER = "11111111-1111-1111-1111-111111111111"
NOW = datetime(2026, 11, 14, 2, 0, tzinfo=timezone.utc)  # Sat 14 Nov 13:00 in Melbourne


class FakeRepo:
    def __init__(self):
        self.user_id = USER
        self.exercises = [
            {"id": "a1", "name": "Bench Press", "is_default": True, "user_id": None, "sets": 3, "reps": 8, "weight": 60, "categories": ["Chest"]},
            {"id": "a2", "name": "Back Squat", "is_default": True, "user_id": None, "sets": 5, "reps": 5, "weight": 80, "categories": ["Legs"]},
            {"id": "m1", "name": "Landmine Press", "is_default": False, "user_id": USER, "sets": 3, "reps": 10, "weight": 20, "categories": []},
        ]
        self.cats = [{"id": "c1", "name": "Chest"}, {"id": "c2", "name": "Legs"}]
        self.logged = []
        self.inserted = []
        self.updated = []
        self.history = {}
        self.between = []

    async def all_exercises(self):
        return self.exercises

    async def categories(self):
        return self.cats

    async def add_category(self, name):
        self.cats.append({"id": "new", "name": name})
        return self.cats[-1]

    async def log_workout(self, entries, when=None):
        self.logged.append((entries, when))
        return {"id": "w1"}

    async def insert_exercise(self, row):
        self.inserted.append(row)
        return row

    async def update_exercise(self, exercise_id, patch):
        self.updated.append((exercise_id, patch))
        return patch

    async def exercise_history(self, exercise_id):
        return self.history.get(exercise_id, [])

    async def recent_workouts(self, limit):
        return []

    async def workouts_between(self, start, end):
        self.between.append((start, end))
        return []


class FakeRoom:
    def __init__(self):
        self.sent = []

    async def __call__(self, topic, payload):
        self.sent.append((topic, payload))


@pytest.fixture
def setup():
    repo, room = FakeRepo(), FakeRoom()
    tools = CoachTools(repo, room, ZoneInfo("Australia/Melbourne"), now=lambda: NOW)
    return tools, repo, room


async def test_log_workout_saves_matched_rows_and_tells_the_app(setup):
    tools, repo, room = setup
    reply = await tools.log_workout([
        {"exercise": "bench", "sets": 3, "reps": 8, "weight": 62.5},
        {"exercise": "squats", "sets": 5, "reps": 5, "weight": 100},
    ])
    assert reply == "Saved: Bench Press, 3 sets of 8 at 62.5 kilos; Back Squat, 5 sets of 5 at 100 kilos."
    entries, when = repo.logged[0]
    assert entries == [
        {"exercise_id": "a1", "sets": 3, "reps": 8, "weight": 62.5},
        {"exercise_id": "a2", "sets": 5, "reps": 5, "weight": 100.0},
    ]
    assert when is None  # today -> the database stamps now()
    assert room.sent == [(TOPIC_DATA_CHANGED, {"kind": "workouts"})]


async def test_log_workout_refuses_out_of_range_and_saves_nothing(setup):
    tools, repo, room = setup
    reply = await tools.log_workout([{"exercise": "bench", "sets": 12, "reps": 8, "weight": 60}])
    assert reply.startswith("Not saved.")
    assert "sets must be between 1 and 10" in reply
    assert repo.logged == [] and room.sent == []


async def test_log_workout_unknown_exercise_is_not_saved(setup):
    tools, repo, _ = setup
    reply = await tools.log_workout([{"exercise": "sled push", "sets": 3, "reps": 10, "weight": 50}])
    assert "isn't in the library" in reply
    assert repo.logged == []


async def test_log_workout_on_an_earlier_day_uses_local_midday(setup):
    tools, repo, _ = setup
    await tools.log_workout([{"exercise": "Bench Press", "sets": 3, "reps": 8, "weight": 60}], day="2026-11-10")
    when = repo.logged[0][1]
    assert when.isoformat() == "2026-11-10T12:00:00+11:00"


async def test_editing_a_built_in_makes_a_personal_copy(setup):
    tools, repo, room = setup
    reply = await tools.update_exercise("bench press", weight=70)
    assert reply == "Updated Bench Press."
    assert repo.updated == []
    assert repo.inserted[0]["parent_exercise_id"] == "a1"
    assert repo.inserted[0]["weight"] == 70
    assert room.sent == [(TOPIC_DATA_CHANGED, {"kind": "exercises"})]


async def test_editing_own_exercise_updates_in_place(setup):
    tools, repo, _ = setup
    await tools.update_exercise("landmine press", categories=["chest"])
    assert repo.updated == [("m1", {"categories": ["Chest"]})]


async def test_add_exercise_blocks_duplicate_names(setup):
    tools, repo, room = setup
    reply = await tools.add_exercise("  bench   press ", ["Chest"])
    assert "already" in reply
    assert repo.inserted == [] and room.sent == []


async def test_add_exercise_keeps_known_categories_only(setup):
    tools, repo, _ = setup
    reply = await tools.add_exercise("Cable Fly", ["chest", "made up"], 3, 12, 15)
    assert reply == "Added Cable Fly under Chest."
    assert repo.inserted[0]["categories"] == ["Chest"]


async def test_suggest_weight_reads_history(setup):
    tools, repo, _ = setup
    repo.history["a1"] = [
        {"sets": 3, "reps": 8, "weight": 60, "date": "2026-11-07T00:00:00Z"},
        {"sets": 3, "reps": 8, "weight": 60, "date": "2026-11-12T00:00:00Z"},
    ]
    reply = await tools.suggest_weight("bench press")
    assert reply.startswith("Bench Press: try 3 sets of 8 at 62.5 kilos.")


async def test_weekly_sets_asks_from_sunday_local(setup):
    tools, repo, _ = setup
    assert await tools.weekly_sets() == "No sets logged since Sunday."
    start, _ = repo.between[0]
    assert start.isoformat() == "2026-11-08T00:00:00+11:00"


async def test_rest_timer_tells_the_app_then_speaks():
    repo, room, said = FakeRepo(), FakeRoom(), []
    tools = CoachTools(repo, room, ZoneInfo("UTC"), say=said.append, now=lambda: NOW)
    reply = await tools.start_rest_timer(5)  # clamped to the 10 second minimum
    assert reply == "Rest timer set for 10 seconds."
    assert room.sent == [(TOPIC_REST_TIMER, {"seconds": 10})]
    assert tools.cancel_rest_timer() is True
    await asyncio.sleep(0)
    assert said == []


async def test_add_category_title_cases_and_skips_existing(setup):
    tools, repo, room = setup
    assert await tools.add_category("chest") == "Chest already exists."
    assert await tools.add_category("glutes") == "Added the Glutes category."
    assert room.sent == [(TOPIC_DATA_CHANGED, {"kind": "categories"})]
