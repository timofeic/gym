"""Pure rules shared with the app. No network, no LiveKit: easy to test."""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Iterable
from zoneinfo import ZoneInfo

LIMITS = {"sets": (1, 10), "reps": (1, 100), "weight": (0, 500)}
WEIGHT_STEP_KG = 2.5


def normalize_name(name: str) -> str:
    """Same rule as the web app and the database column: trim, lower, single spaces."""
    return re.sub(r"\s+", " ", name.strip()).lower()


def visible_exercises(all_rows: Iterable[dict[str, Any]], user_id: str) -> list[dict[str, Any]]:
    """The user's own exercises plus built-in ones they haven't replaced with a copy."""
    rows = list(all_rows)
    replaced = {r.get("parent_exercise_id") for r in rows if r.get("user_id") == user_id and r.get("parent_exercise_id")}
    out = [
        r
        for r in rows
        if r.get("user_id") == user_id or (r.get("is_default") and r["id"] not in replaced)
    ]
    return sorted(out, key=lambda r: r["name"].lower())


@dataclass
class Match:
    exercise: dict[str, Any] | None
    candidates: list[dict[str, Any]] = field(default_factory=list)

    @property
    def found(self) -> bool:
        return self.exercise is not None


def match_exercise(spoken: str, exercises: list[dict[str, Any]]) -> Match:
    """Find the exercise someone said. Ambiguous answers come back as candidates."""
    target = normalize_name(spoken)
    if not target:
        return Match(None)
    by_norm = {normalize_name(e["name"]): e for e in exercises}

    if target in by_norm:
        return Match(by_norm[target])

    # Plural slips: "squats" -> "squat", "curls" -> "curl".
    singular = re.sub(r"s\b", "", target)
    for norm, ex in by_norm.items():
        if re.sub(r"s\b", "", norm) == singular:
            return Match(ex)

    def _sing(s: str) -> str:
        return re.sub(r"s\b", "", s)

    contains = [
        e for n, e in by_norm.items()
        if target in n or n in target or _sing(target) in _sing(n) or _sing(n) in _sing(target)
    ]
    if len(contains) == 1:
        return Match(contains[0])
    if len(contains) > 1:
        # "bench" matches "Bench Press" and "Incline Bench": prefer a word-start hit if unique.
        starts = [e for e in contains if normalize_name(e["name"]).startswith(target)]
        if len(starts) == 1:
            return Match(starts[0])
        return Match(None, contains)

    close = difflib.get_close_matches(target, list(by_norm), n=3, cutoff=0.75)
    if len(close) == 1:
        return Match(by_norm[close[0]])
    if close:
        return Match(None, [by_norm[c] for c in close])
    loose = difflib.get_close_matches(target, list(by_norm), n=3, cutoff=0.5)
    return Match(None, [by_norm[c] for c in loose])


def validate_entry(sets: int, reps: int, weight: float) -> list[str]:
    """Return problems in plain words; empty means fine."""
    problems = []
    for label, value in (("sets", sets), ("reps", reps), ("weight", weight)):
        lo, hi = LIMITS[label]
        if value < lo or value > hi:
            unit = " kg" if label == "weight" else ""
            problems.append(f"{label} must be between {lo} and {hi}{unit}")
    return problems


def week_start(now: datetime, tz: ZoneInfo) -> datetime:
    """Midnight on the most recent Sunday in the user's timezone."""
    local = now.astimezone(tz)
    days_since_sunday = (local.weekday() + 1) % 7
    start = (local - timedelta(days=days_since_sunday)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start


def day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=tz)
    return start, start + timedelta(days=1)


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def weekly_sets(workouts: list[dict[str, Any]]) -> dict[str, int]:
    """Sets per category across the given workouts. Every category counts, whatever it's called."""
    totals: dict[str, int] = {}
    for w in workouts:
        for we in w.get("workout_exercises") or []:
            ex = we.get("exercises") or {}
            for cat in ex.get("categories") or []:
                totals[cat] = totals.get(cat, 0) + int(we["sets"])
    return dict(sorted(totals.items(), key=lambda kv: (-kv[1], kv[0])))


def suggest_next_weight(history: list[dict[str, Any]], target_reps: int, default_weight: float) -> tuple[float, str]:
    """Simple progressive overload.

    history: oldest first, each {"weight", "reps", "sets", "date"}.
    If the last two sessions both hit the target reps at the same weight, add 2.5 kg.
    Otherwise repeat the last weight.
    """
    if not history:
        return float(default_weight), "No history yet, so start at your usual weight."
    last = history[-1]
    last_w = float(last["weight"])
    if len(history) >= 2:
        prev = history[-2]
        if float(prev["weight"]) == last_w and int(prev["reps"]) >= target_reps and int(last["reps"]) >= target_reps:
            return last_w + WEIGHT_STEP_KG, f"You hit {target_reps} reps at {fmt_kg(last_w)} twice in a row, so go up 2.5."
    return last_w, f"Stay at {fmt_kg(last_w)} until you hit {target_reps} reps two sessions running."


def fmt_kg(weight: float) -> str:
    w = float(weight)
    return f"{int(w)} kilos" if w.is_integer() else f"{w:g} kilos"


def describe_entry(name: str, sets: int, reps: int, weight: float) -> str:
    base = f"{name}, {sets} sets of {reps}"
    return base if float(weight) == 0 else f"{base} at {fmt_kg(weight)}"


def spoken_date(when: datetime, tz: ZoneInfo, now: datetime) -> str:
    local = when.astimezone(tz).date()
    today = now.astimezone(tz).date()
    delta = (today - local).days
    if delta == 0:
        return "today"
    if delta == 1:
        return "yesterday"
    if 1 < delta < 7:
        return local.strftime("%A")
    return local.strftime("%A %-d %B")


def summarise_workout(workout: dict[str, Any], tz: ZoneInfo, now: datetime) -> str:
    """One spoken sentence per workout, eg 'Yesterday: Bench Press, 3 sets of 8 at 60 kilos.'"""
    when = spoken_date(parse_ts(workout["date"]), tz, now)
    parts = [
        describe_entry((we.get("exercises") or {}).get("name", "an exercise"), we["sets"], we["reps"], we["weight"])
        for we in workout.get("workout_exercises") or []
    ]
    if not parts:
        return f"{when.capitalize()}: an empty workout."
    return f"{when.capitalize()}: " + "; ".join(parts) + "."
