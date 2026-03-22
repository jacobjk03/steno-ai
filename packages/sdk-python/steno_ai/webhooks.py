"""Webhook client — manage webhook subscriptions."""

from typing import List

from .client import HttpClient


class WebhookClient:
    def __init__(self, http: HttpClient):
        self._http = http

    def create(self, url: str, events: List[str], secret: str) -> dict:
        """Create a webhook subscription."""
        return self._http.request("POST", "/v1/webhooks", json={
            "url": url,
            "events": events,
            "secret": secret,
        })

    def list(self) -> list:
        """List all webhooks."""
        return self._http.request("GET", "/v1/webhooks")

    def delete(self, webhook_id: str) -> None:
        """Delete a webhook."""
        self._http.request("DELETE", f"/v1/webhooks/{webhook_id}")
