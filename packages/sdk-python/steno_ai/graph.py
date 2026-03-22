"""Graph client — explore entity relationships."""

from typing import Optional

from .client import HttpClient


class GraphClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def list_entities(self, limit: int = 20, cursor: Optional[str] = None) -> dict:
        """List known entities."""
        params = f"limit={limit}"
        if cursor:
            params += f"&cursor={cursor}"
        return self._http.request("GET", f"/v1/entities?{params}")

    def get_entity(self, entity_id: str) -> dict:
        """Get a single entity by ID."""
        return self._http.request("GET", f"/v1/entities/{entity_id}")

    def get_related(self, entity_id: str, depth: int = 3) -> dict:
        """Get related entities up to a given depth."""
        return self._http.request("GET", f"/v1/entities/{entity_id}/graph?depth={depth}")
