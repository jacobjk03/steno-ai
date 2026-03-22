"""Session client — start and end memory sessions."""

from .client import HttpClient


class SessionClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def start(self, scope: str, scope_id: str) -> dict:
        """Start a new memory session."""
        return self._http.request("POST", "/v1/sessions", json={
            "scope": scope,
            "scope_id": scope_id,
        })

    def end(self, session_id: str) -> None:
        """End an active session."""
        self._http.request("POST", f"/v1/sessions/{session_id}/end")
