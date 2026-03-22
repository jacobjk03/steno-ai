"""Trigger client — create and manage memory triggers."""

from typing import Dict, List

from .client import HttpClient


class TriggerClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(self, scope: str, scope_id: str, condition: dict) -> dict:
        """Create a memory trigger."""
        return self._http.request("POST", "/v1/triggers", json={
            "scope": scope,
            "scope_id": scope_id,
            "condition": condition,
        })

    def list(self, scope: str, scope_id: str) -> list:
        """List triggers for a scope."""
        return self._http.request("GET", f"/v1/triggers?scope={scope}&scope_id={scope_id}")

    def delete(self, trigger_id: str) -> None:
        """Delete a trigger."""
        self._http.request("DELETE", f"/v1/triggers/{trigger_id}")
