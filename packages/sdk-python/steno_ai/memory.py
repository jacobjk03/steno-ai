"""Memory client — extract, search, and manage stored memories."""

from typing import Any, Dict, List, Optional

from .client import HttpClient


class MemoryClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def add(
        self,
        scope: str,
        scope_id: str,
        input_type: str = "raw_text",
        data: Any = None,
        messages: Optional[List[dict]] = None,
        session_id: Optional[str] = None,
    ) -> dict:
        """Extract and store memories from text or conversation."""
        body: Dict[str, Any] = {
            "scope": scope,
            "scope_id": scope_id,
            "input_type": input_type,
        }
        if data is not None:
            body["data"] = data
        if messages is not None:
            body["messages"] = messages
        if session_id is not None:
            body["session_id"] = session_id
        return self._http.request("POST", "/v1/memory", json=body)

    def search(
        self,
        query: str,
        scope: str,
        scope_id: str,
        limit: int = 10,
        include_graph: bool = False,
    ) -> dict:
        """Semantic search over stored memories."""
        body = {
            "query": query,
            "scope": scope,
            "scope_id": scope_id,
            "limit": limit,
            "include_graph": include_graph,
        }
        return self._http.request("POST", "/v1/memory/search", json=body)

    def feedback(
        self,
        fact_id: str,
        was_useful: bool,
        feedback_type: str,
    ) -> None:
        """Submit feedback on a retrieved fact."""
        self._http.request("POST", "/v1/feedback", json={
            "fact_id": fact_id,
            "was_useful": was_useful,
            "feedback_type": feedback_type,
        })

    def get(self, fact_id: str) -> dict:
        """Get a single fact by ID."""
        return self._http.request("GET", f"/v1/memory/{fact_id}")

    def history(self, fact_id: str) -> list:
        """Get the edit history of a fact."""
        return self._http.request("GET", f"/v1/memory/{fact_id}/history")

    def delete(self, fact_id: str) -> None:
        """Delete a single fact."""
        self._http.request("DELETE", f"/v1/memory/{fact_id}")

    def purge(self, scope: str, scope_id: str) -> None:
        """Purge all memories for a scope."""
        self._http.request("DELETE", "/v1/memory", json={
            "scope": scope,
            "scope_id": scope_id,
        })
