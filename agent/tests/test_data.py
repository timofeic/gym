"""Database calls, with HTTP mocked."""

import json

import httpx
import jwt
import pytest
import respx

from gym_agent.data import GymRepository, make_user_token

URL = "https://example.supabase.co"
SECRET = "test-secret-that-is-long-enough-for-hs256-ok"
USER = "11111111-1111-1111-1111-111111111111"


def test_user_token_claims():
    token = make_user_token(USER, SECRET, now=1_000)
    claims = jwt.decode(token, SECRET, algorithms=["HS256"], audience="authenticated", options={"verify_exp": False})
    assert claims == {"sub": USER, "role": "authenticated", "aud": "authenticated", "iat": 1000, "exp": 4600}


@pytest.fixture
def repo():
    return GymRepository(supabase_url=URL, anon_key="anon", jwt_secret=SECRET, user_id=USER, client=httpx.AsyncClient())


@respx.mock
async def test_requests_carry_anon_key_and_user_token(repo):
    route = respx.get(f"{URL}/rest/v1/exercises").mock(return_value=httpx.Response(200, json=[]))
    await repo.all_exercises()
    req = route.calls.last.request
    assert req.headers["apikey"] == "anon"
    token = req.headers["Authorization"].removeprefix("Bearer ")
    assert jwt.decode(token, SECRET, algorithms=["HS256"], audience="authenticated")["sub"] == USER


@respx.mock
async def test_log_workout_inserts_workout_then_entries(repo):
    w = respx.post(f"{URL}/rest/v1/workouts").mock(return_value=httpx.Response(201, json=[{"id": "w9"}]))
    e = respx.post(f"{URL}/rest/v1/workout_exercises").mock(return_value=httpx.Response(201, json=[]))
    await repo.log_workout([{"exercise_id": "a1", "sets": 3, "reps": 8, "weight": 60}])
    assert json.loads(w.calls.last.request.content) == [{"user_id": USER}]
    assert json.loads(e.calls.last.request.content) == [
        {"workout_id": "w9", "exercise_id": "a1", "sets": 3, "reps": 8, "weight": 60}
    ]


@respx.mock
async def test_failed_entries_remove_the_empty_workout(repo):
    respx.post(f"{URL}/rest/v1/workouts").mock(return_value=httpx.Response(201, json=[{"id": "w9"}]))
    respx.post(f"{URL}/rest/v1/workout_exercises").mock(return_value=httpx.Response(400, json={}))
    delete = respx.delete(f"{URL}/rest/v1/workouts").mock(return_value=httpx.Response(204))
    with pytest.raises(httpx.HTTPStatusError):
        await repo.log_workout([{"exercise_id": "bad", "sets": 3, "reps": 8, "weight": 60}])
    assert delete.calls.last.request.url.params["id"] == "eq.w9"


@respx.mock
async def test_history_is_oldest_first(repo):
    respx.get(f"{URL}/rest/v1/workout_exercises").mock(return_value=httpx.Response(200, json=[
        {"sets": 3, "reps": 8, "weight": 60, "workouts": {"date": "2026-11-12T00:00:00Z"}},
        {"sets": 3, "reps": 8, "weight": 57.5, "workouts": {"date": "2026-11-05T00:00:00Z"}},
    ]))
    hist = await repo.exercise_history("a1")
    assert [h["weight"] for h in hist] == [57.5, 60]


@respx.mock
async def test_update_of_someone_elses_row_is_refused(repo):
    respx.patch(f"{URL}/rest/v1/exercises").mock(return_value=httpx.Response(200, json=[]))
    with pytest.raises(PermissionError):
        await repo.update_exercise("a1", {"weight": 70})
