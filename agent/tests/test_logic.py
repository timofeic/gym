from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from gym_agent import logic

USER = "u1"
EXERCISES = [
    {"id": "a1", "name": "Bench Press", "is_default": True, "user_id": None, "categories": ["Chest", "Push"]},
    {"id": "a2", "name": "Back Squat", "is_default": True, "user_id": None, "categories": ["Legs"]},
    {"id": "a3", "name": "Incline Bench Press", "is_default": True, "user_id": None, "categories": ["Chest"]},
    {"id": "a6", "name": "Bicep Curl", "is_default": True, "user_id": None, "categories": ["Arms"]},
]


def test_normalize_name_trims_lowers_and_collapses_spaces():
    assert logic.normalize_name("  Bench   PRESS ") == "bench press"


def test_user_copy_hides_the_built_in_it_replaces():
    rows = EXERCISES + [
        {"id": "c1", "name": "Bench Press (paused)", "user_id": USER, "parent_exercise_id": "a1", "is_default": False},
        {"id": "o1", "name": "Someone Else's", "user_id": "other", "is_default": False},
    ]
    names = [r["name"] for r in logic.visible_exercises(rows, USER)]
    assert "Bench Press (paused)" in names
    assert "Bench Press" not in names
    assert "Someone Else's" not in names
    assert "Back Squat" in names


def test_match_exact_plural_and_typo():
    assert logic.match_exercise("bench press", EXERCISES).exercise["id"] == "a1"
    assert logic.match_exercise("bicep curls", EXERCISES).exercise["id"] == "a6"
    assert logic.match_exercise("back sqaut", EXERCISES).exercise["id"] == "a2"


def test_match_prefers_the_name_that_starts_with_what_was_said():
    assert logic.match_exercise("bench", EXERCISES).exercise["id"] == "a1"


def test_match_unknown_returns_no_exercise():
    m = logic.match_exercise("zercher carry", EXERCISES)
    assert not m.found


def test_limits_match_the_app():
    assert logic.validate_entry(3, 8, 60) == []
    problems = logic.validate_entry(11, 0, 501)
    assert len(problems) == 3
    assert "sets must be between 1 and 10" in problems


def test_week_starts_on_sunday_in_the_users_timezone():
    tz = ZoneInfo("Australia/Melbourne")
    # Saturday 14 Nov 2026, 23:00 UTC is Sunday 15 Nov 10:00 in Melbourne.
    now = datetime(2026, 11, 14, 23, 0, tzinfo=timezone.utc)
    start = logic.week_start(now, tz)
    assert start.isoformat() == "2026-11-15T00:00:00+11:00"


def test_weekly_sets_count_every_category_and_sum_sets():
    workouts = [
        {"workout_exercises": [
            {"sets": 3, "exercises": {"categories": ["Chest", "Upper", "Push"]}},
            {"sets": 5, "exercises": {"categories": ["Legs", "Lower"]}},
        ]},
        {"workout_exercises": [{"sets": 4, "exercises": {"categories": ["Chest"]}}]},
    ]
    assert logic.weekly_sets(workouts) == {"Chest": 7, "Legs": 5, "Lower": 5, "Push": 3, "Upper": 3}


def test_weekly_sets_do_not_depend_on_a_categorys_name():
    def row(cat):
        return [{"workout_exercises": [{"sets": 4, "exercises": {"categories": ["Back", cat]}}]}]
    assert logic.weekly_sets(row("Pull")) == {"Back": 4, "Pull": 4}
    assert logic.weekly_sets(row("Pulling")) == {"Back": 4, "Pulling": 4}


def test_suggest_adds_2_5_after_two_good_sessions_at_same_weight():
    hist = [{"weight": 60, "reps": 8}, {"weight": 60, "reps": 8}]
    weight, why = logic.suggest_next_weight(hist, target_reps=8, default_weight=40)
    assert weight == 62.5
    assert "2.5" in why


def test_suggest_repeats_weight_until_reps_are_hit_twice():
    hist = [{"weight": 57.5, "reps": 8}, {"weight": 60, "reps": 6}]
    assert logic.suggest_next_weight(hist, 8, 40)[0] == 60


def test_suggest_uses_default_with_no_history():
    assert logic.suggest_next_weight([], 8, 40)[0] == 40


def test_summary_reads_naturally():
    tz = ZoneInfo("UTC")
    now = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
    w = {"date": "2026-11-13T09:00:00+00:00", "workout_exercises": [
        {"sets": 3, "reps": 8, "weight": 60, "exercises": {"name": "Bench Press"}},
        {"sets": 3, "reps": 1, "weight": 0, "exercises": {"name": "Plank"}},
    ]}
    assert logic.summarise_workout(w, tz, now) == (
        "Yesterday: Bench Press, 3 sets of 8 at 60 kilos; Plank, 3 sets of 1."
    )
