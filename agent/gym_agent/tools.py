"""What the coach can do. Framework-free, so tests can call it with fakes.

Every method returns a short sentence meant to be read out, or spoken back to
the model as a tool result.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timezone
from typing import Any, Awaitable, Callable, Protocol
from zoneinfo import ZoneInfo

from . import logic

TOPIC_DATA_CHANGED = "gym.data-changed"
TOPIC_REST_TIMER = "gym.rest-timer"


class Publisher(Protocol):
    async def __call__(self, topic: str, payload: dict[str, Any]) -> None: ...


class CoachTools:
    def __init__(
        self,
        repo: Any,
        publish: Publisher,
        tz: ZoneInfo,
        say: Callable[[str], Awaitable[None] | None] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.repo = repo
        self.publish = publish
        self.tz = tz
        self.say = say
        self.now = now or (lambda: datetime.now(timezone.utc))
        self._rest_task: asyncio.Task | None = None

    # Helpers ------------------------------------------------------------------

    async def _visible(self) -> list[dict[str, Any]]:
        return logic.visible_exercises(await self.repo.all_exercises(), self.repo.user_id)

    async def _resolve(self, spoken: str) -> tuple[dict[str, Any] | None, str]:
        match = logic.match_exercise(spoken, await self._visible())
        if match.found:
            return match.exercise, ""
        if match.candidates:
            names = ", ".join(c["name"] for c in match.candidates[:3])
            return None, f'"{spoken}" could be {names}. Ask which one.'
        return None, f'No exercise called "{spoken}" in the library. Offer to add it.'

    async def _changed(self, kind: str) -> None:
        await self.publish(TOPIC_DATA_CHANGED, {"kind": kind})

    # Reading ------------------------------------------------------------------

    async def list_exercises(self, category: str | None = None) -> str:
        rows = await self._visible()
        if category:
            want = category.strip().lower()
            rows = [r for r in rows if want in [c.lower() for c in r.get("categories") or []]]
        if not rows:
            return f"No exercises in {category}." if category else "The library is empty."
        return "Exercises: " + ", ".join(r["name"] for r in rows) + "."

    async def list_categories(self) -> str:
        cats = await self.repo.categories()
        return "Categories: " + ", ".join(c["name"] for c in cats) + "." if cats else "No categories yet."

    async def recent_workouts(self, limit: int = 3) -> str:
        limit = max(1, min(int(limit), 10))
        rows = await self.repo.recent_workouts(limit)
        if not rows:
            return "No workouts logged yet."
        now = self.now()
        return " ".join(logic.summarise_workout(w, self.tz, now) for w in rows)

    async def workouts_on(self, day: str) -> str:
        try:
            d = date.fromisoformat(day.strip())
        except ValueError:
            return "Give the date as year-month-day, like 2026-11-09."
        start, end = logic.day_bounds(d, self.tz)
        rows = await self.repo.workouts_between(start, end)
        if not rows:
            return f"No workout on {d.strftime('%A %-d %B')}."
        now = self.now()
        return " ".join(logic.summarise_workout(w, self.tz, now) for w in rows)

    async def exercise_history(self, exercise: str) -> str:
        ex, problem = await self._resolve(exercise)
        if not ex:
            return problem
        hist = await self.repo.exercise_history(ex["id"])
        if not hist:
            return f"No {ex['name']} logged yet."
        now = self.now()
        recent = hist[-5:]
        parts = [
            f"{logic.spoken_date(logic.parse_ts(h['date']), self.tz, now)} "
            + logic.describe_entry("", h["sets"], h["reps"], h["weight"]).lstrip(", ")
            for h in recent
        ]
        first, last = float(hist[0]["weight"]), float(hist[-1]["weight"])
        trend = ""
        if len(hist) > 1 and last != first:
            direction = "up" if last > first else "down"
            trend = f" Overall {direction} from {logic.fmt_kg(first)} to {logic.fmt_kg(last)} over {len(hist)} sessions."
        return f"{ex['name']}, last {len(recent)}: " + "; ".join(parts) + "." + trend

    async def weekly_sets(self) -> str:
        now = self.now()
        start = logic.week_start(now, self.tz)
        rows = await self.repo.workouts_between(start, now.astimezone(self.tz) + _one_day())
        totals = logic.weekly_sets(rows)
        if not totals:
            return "No sets logged since Sunday."
        return "Sets since Sunday: " + ", ".join(f"{k} {v}" for k, v in totals.items()) + "."

    async def suggest_weight(self, exercise: str) -> str:
        ex, problem = await self._resolve(exercise)
        if not ex:
            return problem
        hist = await self.repo.exercise_history(ex["id"])
        weight, why = logic.suggest_next_weight(hist, int(ex.get("reps") or 8), float(ex.get("weight") or 0))
        sets = hist[-1]["sets"] if hist else ex.get("sets") or 3
        reps = ex.get("reps") or 8
        return f"{ex['name']}: try {logic.describe_entry('', sets, reps, weight).lstrip(', ')}. {why}"

    # Writing ------------------------------------------------------------------

    async def log_workout(self, entries: list[dict[str, Any]], day: str | None = None) -> str:
        if not entries:
            return "Nothing to log."
        visible = await self._visible()
        rows, spoken, problems = [], [], []
        for e in entries:
            match = logic.match_exercise(str(e.get("exercise", "")), visible)
            if not match.found:
                if match.candidates:
                    problems.append(f'"{e.get("exercise")}" could be ' + ", ".join(c["name"] for c in match.candidates[:3]))
                else:
                    problems.append(f'"{e.get("exercise")}" isn\'t in the library')
                continue
            sets, reps, weight = int(e.get("sets", 0)), int(e.get("reps", 0)), float(e.get("weight", 0))
            issues = logic.validate_entry(sets, reps, weight)
            if issues:
                problems.append(f"{match.exercise['name']}: " + "; ".join(issues))
                continue
            rows.append({"exercise_id": match.exercise["id"], "sets": sets, "reps": reps, "weight": weight})
            spoken.append(logic.describe_entry(match.exercise["name"], sets, reps, weight))
        if problems:
            return "Not saved. " + ". ".join(problems) + "."

        when = None
        if day:
            try:
                d = date.fromisoformat(day.strip())
            except ValueError:
                return "Not saved. Give the date as year-month-day."
            if d != self.now().astimezone(self.tz).date():
                # Midday local time keeps it on the right day in every view.
                when = datetime(d.year, d.month, d.day, 12, tzinfo=self.tz)
        await self.repo.log_workout(rows, when)
        await self._changed("workouts")
        return "Saved: " + "; ".join(spoken) + "."

    async def add_exercise(
        self, name: str, categories: list[str] | None = None, sets: int = 3, reps: int = 10, weight: float = 0
    ) -> str:
        name = " ".join(name.split())
        if not name:
            return "The exercise needs a name."
        norm = logic.normalize_name(name)
        clash = next((e for e in await self._visible() if logic.normalize_name(e["name"]) == norm), None)
        if clash:
            return f'There\'s already an exercise called "{clash["name"]}".'
        issues = logic.validate_entry(int(sets), int(reps), float(weight))
        if issues:
            return "Not added. " + "; ".join(issues) + "."
        cats = await self._known_categories(categories or [])
        await self.repo.insert_exercise(
            {"name": name, "categories": cats, "sets": int(sets), "reps": int(reps), "weight": float(weight)}
        )
        await self._changed("exercises")
        where = f" under {', '.join(cats)}" if cats else ""
        return f"Added {name}{where}."

    async def update_exercise(
        self,
        exercise: str,
        new_name: str | None = None,
        categories: list[str] | None = None,
        sets: int | None = None,
        reps: int | None = None,
        weight: float | None = None,
    ) -> str:
        ex, problem = await self._resolve(exercise)
        if not ex:
            return problem
        patch: dict[str, Any] = {}
        if new_name and new_name.strip() and new_name.strip() != ex["name"]:
            name = " ".join(new_name.split())
            norm = logic.normalize_name(name)
            skip = {ex["id"], ex.get("parent_exercise_id")}
            clash = next(
                (e for e in await self._visible() if e["id"] not in skip and logic.normalize_name(e["name"]) == norm),
                None,
            )
            if clash:
                return f'There\'s already an exercise called "{clash["name"]}".'
            patch["name"] = name
        if categories is not None:
            patch["categories"] = await self._known_categories(categories)
        for key, value in (("sets", sets), ("reps", reps), ("weight", weight)):
            if value is not None:
                patch[key] = value
        if not patch:
            return "Nothing to change."
        merged = {k: patch.get(k, ex.get(k)) for k in ("sets", "reps", "weight")}
        issues = logic.validate_entry(int(merged["sets"]), int(merged["reps"]), float(merged["weight"]))
        if issues:
            return "Not changed. " + "; ".join(issues) + "."

        if ex.get("is_default") and not ex.get("user_id"):
            # Built-in exercise: save a personal copy, like the app does.
            copy = {
                "name": patch.get("name", ex["name"]),
                "categories": patch.get("categories", ex.get("categories") or []),
                "sets": merged["sets"],
                "reps": merged["reps"],
                "weight": merged["weight"],
                "parent_exercise_id": ex["id"],
            }
            await self.repo.insert_exercise(copy)
        else:
            await self.repo.update_exercise(ex["id"], patch)
        await self._changed("exercises")
        return f"Updated {patch.get('name', ex['name'])}."

    async def add_category(self, name: str) -> str:
        name = " ".join(name.split()).title()
        if not name:
            return "The category needs a name."
        existing = await self.repo.categories()
        if any(c["name"].lower() == name.lower() for c in existing):
            return f"{name} already exists."
        await self.repo.add_category(name)
        await self._changed("categories")
        return f"Added the {name} category."

    async def _known_categories(self, wanted: list[str]) -> list[str]:
        """Map spoken category names onto existing ones; drop unknowns."""
        if not wanted:
            return []
        by_lower = {c["name"].lower(): c["name"] for c in await self.repo.categories()}
        return [by_lower[w.strip().lower()] for w in wanted if w.strip().lower() in by_lower]

    # Rest timer ---------------------------------------------------------------

    async def start_rest_timer(self, seconds: int) -> str:
        seconds = max(10, min(int(seconds), 600))
        self.cancel_rest_timer()
        await self.publish(TOPIC_REST_TIMER, {"seconds": seconds})
        self._rest_task = asyncio.create_task(self._rest_then_speak(seconds))
        return f"Rest timer set for {seconds} seconds."

    def cancel_rest_timer(self) -> bool:
        if self._rest_task and not self._rest_task.done():
            self._rest_task.cancel()
            return True
        return False

    async def _rest_then_speak(self, seconds: int) -> None:
        await asyncio.sleep(seconds)
        if self.say:
            result = self.say("Rest's up. Next set when you're ready.")
            if asyncio.iscoroutine(result):
                await result


def _one_day():
    from datetime import timedelta

    return timedelta(days=1)


def encode_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode()
