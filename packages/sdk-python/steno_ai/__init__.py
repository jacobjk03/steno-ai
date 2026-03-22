"""
Steno AI SDK — dead-simple memory for your AI apps.

    from steno_ai import Steno

    steno = Steno("sk_steno_...")
    steno.add("user_123", "I love pizza and I work at Google")
    results = steno.search("user_123", "food preferences")
"""

from .client import HttpClient
from .errors import StenoError
from .keys import KeyClient
from .memory import MemoryClient
from .sessions import SessionClient
from .triggers import TriggerClient

__all__ = [
    "Steno",
    "StenoError",
    "MemoryClient",
    "SessionClient",
    "TriggerClient",
    "KeyClient",
]


class Steno:
    """The Steno AI client. One import, one constructor, one-liner methods."""

    def __init__(self, api_key: str, base_url: str = "https://api.steno.ai"):
        if not api_key:
            raise ValueError("Steno API key is required")

        self._http = HttpClient(api_key, base_url)
        self.memory = MemoryClient(self._http)
        self.sessions = SessionClient(self._http)
        self.triggers = TriggerClient(self._http)
        self.keys = KeyClient(self._http)

    # ── One-liners ──

    def add(self, user_id: str, content) -> dict:
        """Add a memory — the simplest way.

        Pass a string for raw text, or a list of message dicts for conversation.

            steno.add("user_123", "I love pizza")
            steno.add("user_123", [
                {"role": "user", "content": "I love pizza"},
                {"role": "assistant", "content": "Got it!"},
            ])
        """
        if isinstance(content, str):
            return self.memory.add(
                scope="user",
                scope_id=user_id,
                input_type="raw_text",
                data=content,
            )
        return self.memory.add(
            scope="user",
            scope_id=user_id,
            input_type="conversation",
            messages=content,
        )

    def search(self, user_id: str, query: str, limit: int = 10) -> dict:
        """Search memories — one line.

            results = steno.search("user_123", "food preferences")
        """
        return self.memory.search(
            query=query,
            scope="user",
            scope_id=user_id,
            limit=limit,
        )

    def feedback(self, fact_id: str, useful: bool) -> None:
        """Give feedback on a memory — thumbs up or down.

            steno.feedback("fact_id", True)   # useful
            steno.feedback("fact_id", False)  # not useful
        """
        self.memory.feedback(
            fact_id=fact_id,
            was_useful=useful,
            feedback_type="explicit_positive" if useful else "explicit_negative",
        )

    def usage(self) -> dict:
        """Get usage stats for the current API key."""
        return self.keys.usage()
