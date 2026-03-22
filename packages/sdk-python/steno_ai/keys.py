"""Key client — manage API keys and usage."""

from .client import HttpClient


class KeyClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(self, name: str) -> dict:
        """Create a new API key."""
        return self._http.request("POST", "/v1/keys", json={"name": name})

    def list(self) -> list:
        """List all API keys."""
        return self._http.request("GET", "/v1/keys")

    def revoke(self, key_id: str) -> None:
        """Revoke an API key."""
        self._http.request("DELETE", f"/v1/keys/{key_id}")

    def usage(self) -> dict:
        """Get usage stats for the current key."""
        return self._http.request("GET", "/v1/usage")
