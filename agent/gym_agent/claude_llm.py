"""Claude for voice, on top of the LiveKit Anthropic plugin.

The model is one constant here (override with the LLM_MODEL env var).

Claude Sonnet 5.5 rules this wrapper respects:
- No temperature / top_p / top_k (non-default values are a 400): we never set them.
- `thinking: {type: "disabled"}` and `budget_tokens` are a 400. For speed we send
  `thinking: {type: "between_tools"}` (no other fields), which needs effort high or below.
- Forced tool_choice (any / tool) is a 400: the plugin already downgrades it to auto for
  this model, and we never ask for it.
- No assistant prefill: the plugin's prefill list predates Sonnet 5.5, so we add it.
- Effort: `low`, because a voice reply should start fast.
"""

from __future__ import annotations

import os
from typing import Any

from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.plugins import anthropic as lk_anthropic
from livekit.plugins.anthropic import llm as plugin_llm

DEFAULT_MODEL = "claude-sonnet-5-5"
MODEL = os.environ.get("LLM_MODEL") or DEFAULT_MODEL
EFFORT = "low"

# Models with no assistant prefill. The plugin only knows the 4.6 family.
_NO_PREFILL = ("claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-mythos-5", "claude-haiku-5")
if not all(p in plugin_llm._NO_PREFILL_PATTERNS for p in _NO_PREFILL):
    plugin_llm._NO_PREFILL_PATTERNS = tuple(plugin_llm._NO_PREFILL_PATTERNS) + _NO_PREFILL


def request_extras(model: str = MODEL) -> dict[str, Any]:
    """Extra Messages API fields for this model. Kept separate so tests can check them."""
    extras: dict[str, Any] = {"output_config": {"effort": EFFORT}}
    if model.startswith("claude-sonnet-5-5"):
        extras["thinking"] = {"type": "between_tools"}
    return extras


class ClaudeVoiceLLM(lk_anthropic.LLM):
    def __init__(self, model: str = MODEL, **kwargs: Any) -> None:
        for banned in ("temperature", "top_k"):
            if banned in kwargs:
                raise ValueError(f"{banned} is not accepted by {model}")
        kwargs.setdefault("max_tokens", 2048)
        super().__init__(model=model, **kwargs)

    def chat(self, *args: Any, extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN, **kwargs: Any):
        merged = request_extras(self._opts.model)
        if extra_kwargs is not NOT_GIVEN and extra_kwargs:
            merged.update(extra_kwargs)
        return super().chat(*args, extra_kwargs=merged, **kwargs)
