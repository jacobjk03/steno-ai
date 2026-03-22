from steno_ai import Steno
from typing import Dict, List, Any


class StenoMemory:
    """LangChain-compatible memory backed by Steno.

    Provides load/save/clear methods for use with LangChain chains and
    LangGraph workflows. Searches Steno for relevant memories on load
    and stores conversation turns on save.

    Usage with LangGraph::

        memory = StenoMemory(api_key="sk_steno_...", user_id="user_123")

        # In a graph node:
        def chatbot(state):
            context = memory.load_memory_variables({"input": state["input"]})
            # ... use context["history"] in your prompt ...
            return {"output": response}

    Usage as a simple memory layer::

        memory = StenoMemory(api_key="sk_steno_...", user_id="user_123")
        memories = memory.load_memory_variables({"input": "food preferences"})
        memory.save_context(
            {"input": "I love pizza"},
            {"output": "Got it!"},
        )
    """

    def __init__(
        self,
        api_key: str,
        user_id: str,
        base_url: str = None,
        memory_key: str = "history",
        input_key: str = "input",
        output_key: str = "output",
        max_memories: int = 5,
    ):
        self.steno = Steno(api_key, base_url=base_url) if base_url else Steno(api_key)
        self.user_id = user_id
        self.memory_key = memory_key
        self.input_key = input_key
        self.output_key = output_key
        self.max_memories = max_memories

    @property
    def memory_variables(self) -> List[str]:
        """Return the list of keys this memory will inject."""
        return [self.memory_key]

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, str]:
        """Search Steno for relevant memories based on the input."""
        query = inputs.get(self.input_key, "")
        if not query:
            return {self.memory_key: ""}

        try:
            results = self.steno.search(self.user_id, str(query), limit=self.max_memories)
            memories = results.get("results", [])
            if not memories:
                return {self.memory_key: ""}

            memory_text = "\n".join(f"- {m.get('content', '')}" for m in memories)
            return {self.memory_key: f"Relevant memories:\n{memory_text}"}
        except Exception:
            return {self.memory_key: ""}

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Store the conversation turn in Steno."""
        input_text = inputs.get(self.input_key, "")
        output_text = outputs.get(self.output_key, "")

        if input_text and output_text:
            try:
                self.steno.add(self.user_id, [
                    {"role": "user", "content": str(input_text)},
                    {"role": "assistant", "content": str(output_text)},
                ])
            except Exception:
                pass  # Don't break the chain on memory failures

    def get_profile(self) -> dict:
        """Get structured user profile.

        Returns a dict with 'static' and 'dynamic' keys containing
        lists of known facts about the user.

        Returns:
            dict: Profile data, or empty dict on failure.
        """
        try:
            return self.steno.profile(self.user_id)
        except Exception:
            return {}

    def clear(self) -> None:
        """Purge all memories for this user."""
        try:
            self.steno.memory.purge("user", self.user_id)
        except Exception:
            pass
