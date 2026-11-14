"""Talks to Supabase as one user, so row level security limits what we can touch."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

import httpx
import jwt

WORKOUT_SELECT = (
    "id,date,workout_exercises(exercise_id,sets,reps,weight,exercises(id,name,categories))"
)


def make_user_token(user_id: str, jwt_secret: str, ttl_seconds: int = 3600, now: float | None = None) -> str:
    """Same claims the sign-in service uses (see docs/native-architecture.md)."""
    issued = int(now if now is not None else time.time())
    claims = {
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": issued,
        "exp": issued + ttl_seconds,
    }
    return jwt.encode(claims, jwt_secret, algorithm="HS256")


class GymRepository:
    def __init__(
        self,
        *,
        supabase_url: str,
        anon_key: str,
        jwt_secret: str,
        user_id: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.user_id = user_id
        self._jwt_secret = jwt_secret
        self._anon_key = anon_key
        self._token = ""
        self._token_exp = 0.0
        self._client = client or httpx.AsyncClient(timeout=10.0)
        self._base = supabase_url.rstrip("/") + "/rest/v1"

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        if time.time() > self._token_exp - 60:
            self._token = make_user_token(self.user_id, self._jwt_secret)
            self._token_exp = time.time() + 3600
        h = {"apikey": self._anon_key, "Authorization": f"Bearer {self._token}"}
        if prefer:
            h["Prefer"] = prefer
        return h

    async def _get(self, path: str, params: dict[str, str] | list[tuple[str, str]]) -> Any:
        r = await self._client.get(f"{self._base}/{path}", params=params, headers=self._headers())
        r.raise_for_status()
        return r.json()

    async def _post(self, path: str, body: Any) -> Any:
        r = await self._client.post(
            f"{self._base}/{path}", json=body, headers=self._headers("return=representation")
        )
        r.raise_for_status()
        return r.json()

    async def aclose(self) -> None:
        await self._client.aclose()

    # Exercises and categories -------------------------------------------------

    async def all_exercises(self) -> list[dict[str, Any]]:
        return await self._get("exercises", {"select": "*", "order": "name"})

    async def categories(self) -> list[dict[str, Any]]:
        return await self._get("categories", {"select": "id,name", "order": "name"})

    async def add_category(self, name: str) -> dict[str, Any]:
        return (await self._post("categories", [{"name": name}]))[0]

    async def insert_exercise(self, row: dict[str, Any]) -> dict[str, Any]:
        body = {**row, "user_id": self.user_id, "is_default": False}
        return (await self._post("exercises", [body]))[0]

    async def update_exercise(self, exercise_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        r = await self._client.patch(
            f"{self._base}/exercises",
            params={"id": f"eq.{exercise_id}"},
            json=patch,
            headers=self._headers("return=representation"),
        )
        r.raise_for_status()
        rows = r.json()
        if not rows:
            raise PermissionError("That exercise can't be changed.")
        return rows[0]

    # Workouts -----------------------------------------------------------------

    async def log_workout(self, entries: list[dict[str, Any]], when: datetime | None = None) -> dict[str, Any]:
        """entries: [{exercise_id, sets, reps, weight}]. Removes the workout if the entries fail."""
        body: dict[str, Any] = {"user_id": self.user_id}
        if when is not None:
            body["date"] = when.isoformat()
        workout = (await self._post("workouts", [body]))[0]
        try:
            rows = [{"workout_id": workout["id"], **e} for e in entries]
            await self._post("workout_exercises", rows)
        except Exception:
            await self._client.delete(
                f"{self._base}/workouts", params={"id": f"eq.{workout['id']}"}, headers=self._headers()
            )
            raise
        return workout

    async def recent_workouts(self, limit: int = 5) -> list[dict[str, Any]]:
        return await self._get(
            "workouts", {"select": WORKOUT_SELECT, "order": "date.desc", "limit": str(limit)}
        )

    async def workouts_between(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        return await self._get(
            "workouts",
            [
                ("select", WORKOUT_SELECT),
                ("date", f"gte.{start.isoformat()}"),
                ("date", f"lt.{end.isoformat()}"),
                ("order", "date.desc"),
            ],
        )

    async def exercise_history(self, exercise_id: str) -> list[dict[str, Any]]:
        """Oldest first: [{sets, reps, weight, date}]."""
        rows = await self._get(
            "workout_exercises",
            {"select": "sets,reps,weight,workouts(date)", "exercise_id": f"eq.{exercise_id}"},
        )
        out = [
            {"sets": r["sets"], "reps": r["reps"], "weight": r["weight"], "date": r["workouts"]["date"]}
            for r in rows
            if r.get("workouts")
        ]
        return sorted(out, key=lambda r: r["date"])
