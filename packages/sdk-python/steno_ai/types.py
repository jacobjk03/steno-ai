"""Type definitions for the Steno SDK."""

from typing import Any, Dict, List, Literal, Optional, TypedDict


Scope = Literal["user", "org", "project", "global"]


class Message(TypedDict):
    role: str
    content: str


# ── Memory ──


class AddMemoryParams(TypedDict, total=False):
    scope: Scope
    scope_id: str
    input_type: Literal["raw_text", "conversation"]
    data: Any
    messages: List[Message]
    session_id: str


class SearchParams(TypedDict, total=False):
    query: str
    scope: Scope
    scope_id: str
    limit: int
    include_graph: bool


class FeedbackParams(TypedDict, total=False):
    fact_id: str
    was_useful: bool
    feedback_type: Literal["explicit_positive", "explicit_negative"]


# ── Triggers ──


class TriggerCondition(TypedDict, total=False):
    topic_match: List[str]


class CreateTriggerParams(TypedDict, total=False):
    scope: Scope
    scope_id: str
    condition: TriggerCondition
