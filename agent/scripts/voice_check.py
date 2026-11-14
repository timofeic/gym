"""End-to-end check of the deployed coach, by text instead of voice.

It joins a LiveKit room the same way the iPhone app does (identity = user id,
timezone in metadata, room config that dispatches `gym-coach`), types to the
agent on the `lk.chat` topic, prints what the agent says, and waits for the
`gym.data-changed` message. Then it reads the logged workout back from Supabase.

It uses a throwaway user made with the Supabase service role key and deletes
that user at the end, which also deletes their workouts (on delete cascade).

    uv run python scripts/voice_check.py               # make user, talk, clean up
    uv run python scripts/voice_check.py --keep        # leave the test user and rows

Reads LIVEKIT_* and SUPABASE_URL from agent/.env, and SUPABASE_SERVICE_ROLE_KEY
from ../gym-app/.env.local (so it never goes into the agent's secrets).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from datetime import timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit import api, rtc

AGENT_NAME = "gym-coach"
TEST_EMAIL_DOMAIN = "voice-check.invalid"

SCRIPT = [
    "Log squats, 5 sets of 5 at 100 kilos.",
    "Yes, that's right.",
]


class Supabase:
    def __init__(self, url: str, service_key: str) -> None:
        self.rest = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self.client = httpx.AsyncClient(timeout=15)

    async def make_user(self) -> dict:
        user = {"id": str(uuid.uuid4()), "name": "Voice check", "email": f"{uuid.uuid4().hex[:12]}@{TEST_EMAIL_DOMAIN}"}
        r = await self.client.post(
            f"{self.rest}/users",
            json=user,
            headers={**self.h, "Content-Profile": "next_auth", "Prefer": "return=representation"},
        )
        r.raise_for_status()
        return r.json()[0]

    async def workouts(self, user_id: str) -> list[dict]:
        r = await self.client.get(
            f"{self.rest}/workouts",
            params={
                "select": "id,date,user_id,workout_exercises(id,sets,reps,weight,exercises(name))",
                "user_id": f"eq.{user_id}",
            },
            headers=self.h,
        )
        r.raise_for_status()
        return r.json()

    async def delete_user(self, user_id: str) -> None:
        r = await self.client.delete(
            f"{self.rest}/users",
            params={"id": f"eq.{user_id}", "email": f"like.*@{TEST_EMAIL_DOMAIN}"},
            headers={**self.h, "Content-Profile": "next_auth"},
        )
        r.raise_for_status()


def room_token(user: dict, room: str) -> str:
    return (
        api.AccessToken()
        .with_identity(user["id"])
        .with_name(user["name"])
        .with_metadata(json.dumps({"timezone": "Australia/Melbourne"}))
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .with_room_config(api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name=AGENT_NAME)]))
        .with_ttl(timedelta(minutes=15))
        .to_jwt()
    )


def stamp(start: float) -> str:
    return f"[{time.monotonic() - start:5.1f}s]"


async def talk(user: dict, timeout: float) -> list[dict]:
    room = rtc.Room()
    start = time.monotonic()
    replies: asyncio.Queue[str] = asyncio.Queue()
    changes: list[dict] = []
    changed = asyncio.Event()

    def on_transcript(reader: rtc.TextStreamReader, sender: str) -> None:
        if sender == user["id"]:
            return

        async def read() -> None:
            text = await reader.read_all()
            if text.strip():
                print(f"{stamp(start)} coach: {text.strip()}")
                await replies.put(text)

        asyncio.ensure_future(read())

    @room.on("data_received")
    def on_data(packet: rtc.DataPacket) -> None:
        if packet.topic == "gym.data-changed":
            body = json.loads(packet.data)
            print(f"{stamp(start)} data message on gym.data-changed: {json.dumps(body)}")
            changes.append(body)
            changed.set()

    room.register_text_stream_handler("lk.transcription", on_transcript)
    name = f"voice-check-{uuid.uuid4().hex[:8]}"
    await room.connect(os.environ["LIVEKIT_URL"], room_token(user, name))
    print(f"{stamp(start)} joined room {name} as test user {user['id']}")

    try:
        await asyncio.wait_for(replies.get(), timeout)  # greeting
        for line in SCRIPT:
            await asyncio.sleep(1)
            print(f"{stamp(start)} me:    {line}")
            await room.local_participant.send_text(line, topic="lk.chat")
            await asyncio.wait_for(replies.get(), timeout)
        await asyncio.wait_for(changed.wait(), timeout)
        # Let the coach finish its "saved" line.
        try:
            await asyncio.wait_for(replies.get(), 8)
        except asyncio.TimeoutError:
            pass
    finally:
        await room.disconnect()
    return changes


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true", help="don't delete the test user and rows")
    parser.add_argument("--timeout", type=float, default=45)
    args = parser.parse_args()

    here = Path(__file__).resolve().parent.parent
    load_dotenv(here / ".env")
    # The service role key stays in the web app's env file, never in agent/.env,
    # so `lk agent create --secrets-file .env` can't ship it.
    load_dotenv(here.parent / "gym-app" / ".env.local")
    db = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    user = await db.make_user()
    print(f"created test user {user['id']} <{user['email']}>")
    ok = False
    try:
        await talk(user, args.timeout)
        rows = await db.workouts(user["id"])
        print("rows in Supabase for the test user:")
        print(json.dumps(rows, indent=2))
        entries = [e for w in rows for e in w["workout_exercises"]]
        ok = any(e["sets"] == 5 and e["reps"] == 5 and float(e["weight"]) == 100 for e in entries)
    finally:
        if args.keep:
            print(f"kept test user {user['id']}")
        else:
            await db.delete_user(user["id"])
            left = await db.workouts(user["id"])
            print(f"deleted test user {user['id']}; workouts left for them: {len(left)}")
    print("PASS" if ok else "FAIL: no 5x5 at 100 kg row")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
