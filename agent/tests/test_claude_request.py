"""Check the exact Claude request the voice agent would send. Nothing is sent."""

import pytest
from livekit.agents import llm

from gym_agent import agent as agent_mod
from gym_agent.claude_llm import DEFAULT_MODEL, ClaudeVoiceLLM


class FakeCoach:
    pass


async def test_request_fits_sonnet_5_5_rules(monkeypatch):
    captured = {}

    lm = ClaudeVoiceLLM(api_key="sk-test-not-real")

    async def fake_create(**kwargs):
        captured.update(kwargs)
        raise RuntimeError("stop before network")

    monkeypatch.setattr(lm._client.messages, "create", fake_create)

    coach = agent_mod.GymCoach(FakeCoach(), today="Saturday 14 November 2026")
    ctx = llm.ChatContext()
    ctx.add_message(role="system", content=coach.instructions)
    ctx.add_message(role="user", content="Log bench three by eight at sixty")
    ctx.add_message(role="assistant", content="Bench Press, 3 sets of 8 at 60 kilos. Save it?")

    stream = lm.chat(chat_ctx=ctx, tools=list(coach.tools))
    with pytest.raises(RuntimeError):
        await stream._create_anthropic_stream()
    await stream.aclose()

    assert captured["model"] == DEFAULT_MODEL == "claude-sonnet-5-5"
    assert captured["output_config"] == {"effort": "low"}
    assert captured["thinking"] == {"type": "between_tools"}
    for banned in ("temperature", "top_p", "top_k"):
        assert banned not in captured
        assert banned not in (captured.get("extra_body") or {})
    assert captured.get("tool_choice", {"type": "auto"})["type"] == "auto"
    # No assistant prefill: the last message must be from the user.
    assert captured["messages"][-1]["role"] == "user"
    names = {t["name"] for t in captured["tools"]}
    assert {"log_workout", "weekly_sets", "start_rest_timer", "update_exercise"} <= names


def test_temperature_is_rejected_up_front():
    with pytest.raises(ValueError):
        ClaudeVoiceLLM(api_key="sk-test-not-real", temperature=0.2)


def test_timezone_falls_back_to_utc():
    assert str(agent_mod.timezone_from_metadata('{"timezone": "Australia/Melbourne"}')) == "Australia/Melbourne"
    assert str(agent_mod.timezone_from_metadata("not json")) == "UTC"
    assert str(agent_mod.timezone_from_metadata('{"timezone": "Mars/Base"}')) == "UTC"
