"""Low-level HTTP client for the Steno API."""

import time
from typing import Any, Optional

import httpx

from .errors import StenoError


class HttpClient:
    """Handles auth, JSON serialization, rate-limit retries, and error mapping."""

    def __init__(self, api_key: str, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def request(self, method: str, path: str, json: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        response = self._client.request(method, url, json=json)

        # Rate-limit: retry once after the indicated delay
        if response.status_code == 429:
            retry_after = int(response.headers.get("retry-after", "5"))
            time.sleep(retry_after)
            return self.request(method, path, json=json)

        if not response.is_success:
            try:
                body = response.json()
                error = body.get("error", {})
            except Exception:
                error = {}
            raise StenoError(
                code=error.get("code", "unknown"),
                message=error.get("message", response.text),
                status=response.status_code,
            )

        # 204 No Content
        if response.status_code == 204:
            return None

        data = response.json()
        return data.get("data", data)

    def close(self) -> None:
        self._client.close()
