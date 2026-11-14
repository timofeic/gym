"""Claude for voice, on top of the LiveKit Anthropic plugin.

The model is one constant here (override with the LLM_MODEL env var).

Claude Haiku 5.5 rules this wrapper respects:
- No temperature / top_p / top_k (non-default values are a 400): we never set them.
- Effort defaults to `medium`, so we send `low` explicitly: a voice reply should start fast.
- Thinking: adaptive (`{"type": "adaptive"}`). `between_tools` is Sonnet 5.5 only and
  `budget_tokens` is a 400.
- No assistant prefill: the plugin's prefill list predates the 5 family, so we add it.
- We never force tool_choice; the plugin leaves it on auto.
- Refusals: Haiku 5.5 has no server-side fallback. A declined reply ends with
  `stop_reason: "refusal"`, and we speak a short apology instead of going quiet.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from livekit.agents import llm
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.plugins import anthropic as lk_anthropic
from livekit.plugins.anthropic import llm as plugin_llm

log = logging.getLogger("gym-coach")

DEFAULT_MODEL = "claude-haiku-5-5"
MODEL = os.environ.get("LLM_MODEL") or DEFAULT_MODEL
EFFORT = "low"
REFUSAL_REPLY = "Sorry, I can't help with that one. Let's get back to your training."

# Models with no assistant prefill. The plugin only knows the 4.6 family.
_NO_PREFILL = ("claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-mythos-5", "claude-haiku-5")
if not all(p in plugin_llm._NO_PREFILL_PATTERNS for p in _NO_PREFILL):
    plugin_llm._NO_PREFILL_PATTERNS = tuple(plugin_llm._NO_PREFILL_PATTERNS) + _NO_PREFILL


def request_extras(model: str = MODEL) -> dict[str, Any]:
    """Extra Messages API fields for this model. Kept separate so tests can check them."""
    extras: dict[str, Any] = {"output_config": {"effort": EFFORT}}
    if model.startswith("claude-sonnet-5-5"):
        extras["thinking"] = {"type": "between_tools"}
    else:
        extras["thinking"] = {"type": "adaptive"}
    return extras


class RefusalAwareStream(plugin_llm.LLMStream):
    """The plugin's stream, plus a spoken line when Claude declines."""

    def _parse_event(self, event: Any) -> llm.ChatChunk | None:
        if event.type == "message_delta" and getattr(event.delta, "stop_reason", None) == "refusal":
            super()._parse_event(event)  # keep the token count
            details = getattr(event.delta, "stop_details", None)
            log.warning("claude declined a reply", extra={"category": getattr(details, "category", None)})
            return llm.ChatChunk(
                id=self._request_id,
                delta=llm.ChoiceDelta(content=REFUSAL_REPLY, role="assistant"),
            )
        return super()._parse_event(event)


class ClaudeVoiceLLM(lk_anthropic.LLM):
    def __init__(self, model: str = MODEL, **kwargs: Any) -> None:
        for banned in ("temperature", "top_k", "top_p"):
            if banned in kwargs:
                raise ValueError(f"{banned} is not accepted by {model}")
        kwargs.setdefault("max_tokens", 2048)
        super().__init__(model=model, **kwargs)

    def chat(self, *args: Any, extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN, **kwargs: Any):
        merged = request_extras(self._opts.model)
        if extra_kwargs is not NOT_GIVEN and extra_kwargs:
            merged.update(extra_kwargs)
        stream = super().chat(*args, extra_kwargs=merged, **kwargs)
        # Same object and state, just with refusal handling on top.
        stream.__class__ = RefusalAwareStream
        return stream
