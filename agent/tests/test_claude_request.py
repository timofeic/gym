"""Check the exact Claude request the voice agent would send. Nothing is sent."""

import pytest
from livekit.agents import llm

from gym_agent import agent as agent_mod
from types import SimpleNamespace

from gym_agent.claude_llm import DEFAULT_MODEL, REFUSAL_REPLY, ClaudeVoiceLLM, RefusalAwareStream, request_extras


class FakeCoach:
    pass


async def test_request_fits_haiku_5_5_rules(monkeypatch):
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

    assert captured["model"] == DEFAULT_MODEL == "claude-haiku-5-5"
    # Haiku 5.5 defaults to medium effort, so low must be sent explicitly.
    assert captured["output_config"] == {"effort": "low"}
    # between_tools is Sonnet 5.5 only; budget_tokens is a 400.
    assert captured["thinking"] == {"type": "adaptive"}
    for banned in ("temperature", "top_p", "top_k"):
        assert banned not in captured
        assert banned not in (captured.get("extra_body") or {})
    assert captured.get("tool_choice", {"type": "auto"})["type"] == "auto"
    # No assistant prefill: the last message must be from the user.
    assert captured["messages"][-1]["role"] == "user"
    names = {t["name"] for t in captured["tools"]}
    assert {"log_workout", "weekly_sets", "start_rest_timer", "update_exercise"} <= names


@pytest.mark.parametrize("banned", ["temperature", "top_k", "top_p"])
def test_sampling_settings_are_rejected_up_front(banned):
    with pytest.raises(ValueError):
        ClaudeVoiceLLM(api_key="sk-test-not-real", **{banned: 0.2})


def test_sonnet_override_still_gets_its_own_thinking_mode():
    assert request_extras("claude-sonnet-5-5")["thinking"] == {"type": "between_tools"}
    assert request_extras("claude-haiku-5-5")["thinking"] == {"type": "adaptive"}


async def test_refusal_is_spoken_not_silent():
    lm = ClaudeVoiceLLM(api_key="sk-test-not-real")
    stream = lm.chat(chat_ctx=llm.ChatContext())
    assert isinstance(stream, RefusalAwareStream)
    stream._request_id = "msg_1"
    refusal = SimpleNamespace(
        type="message_delta",
        delta=SimpleNamespace(stop_reason="refusal", stop_details=SimpleNamespace(category="general_harms")),
        usage=SimpleNamespace(output_tokens=3),
    )
    chunk = stream._parse_event(refusal)
    assert chunk is not None and chunk.delta.content == REFUSAL_REPLY
    assert stream._output_tokens == 3

    normal = SimpleNamespace(
        type="message_delta",
        delta=SimpleNamespace(stop_reason="end_turn", stop_details=None),
        usage=SimpleNamespace(output_tokens=1),
    )
    assert stream._parse_event(normal) is None
    await stream.aclose()


def test_timezone_falls_back_to_utc():
    assert str(agent_mod.timezone_from_metadata('{"timezone": "Australia/Melbourne"}')) == "Australia/Melbourne"
    assert str(agent_mod.timezone_from_metadata("not json")) == "UTC"
    assert str(agent_mod.timezone_from_metadata('{"timezone": "Mars/Base"}')) == "UTC"
