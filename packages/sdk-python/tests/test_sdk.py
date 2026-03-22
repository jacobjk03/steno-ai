"""Tests for the Steno AI Python SDK."""

from unittest.mock import MagicMock, patch

import pytest

from steno_ai import Steno, StenoError


def _mock_response(status_code=200, json_data=None, headers=None):
    """Create a mock httpx response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.headers = headers or {}
    resp.text = "error"
    resp.json.return_value = json_data or {}
    return resp


class TestStenoInit:
    def test_requires_api_key(self):
        with pytest.raises(ValueError, match="API key is required"):
            Steno("")

    def test_creates_sub_clients(self):
        steno = Steno("sk_test_123")
        assert steno.memory is not None
        assert steno.sessions is not None
        assert steno.triggers is not None
        assert steno.keys is not None


class TestAddOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_add_string(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"extraction_id": "ext_123"}}
        )

        steno = Steno("sk_test_123")
        result = steno.add("user_1", "I love pizza")

        call_args = mock_client.request.call_args
        # httpx.Client.request(method, url, json=...) — method and url are positional
        assert call_args[0][0] == "POST"
        assert "/v1/memory" in call_args[0][1]
        body = call_args[1].get("json", {})
        assert body["scope"] == "user"
        assert body["scope_id"] == "user_1"
        assert body["input_type"] == "raw_text"
        assert body["data"] == "I love pizza"
        assert result == {"extraction_id": "ext_123"}

    @patch("steno_ai.client.httpx.Client")
    def test_add_messages(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"extraction_id": "ext_456"}}
        )

        steno = Steno("sk_test_123")
        messages = [
            {"role": "user", "content": "I love pizza"},
            {"role": "assistant", "content": "Got it!"},
        ]
        result = steno.add("user_1", messages)

        body = mock_client.request.call_args[1].get("json", {})
        assert body["input_type"] == "conversation"
        assert body["messages"] == messages
        assert result == {"extraction_id": "ext_456"}


class TestSearchOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_search(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"results": [{"id": "f1", "content": "Loves pizza", "score": 0.95}], "query": "food"}}
        )

        steno = Steno("sk_test_123")
        result = steno.search("user_1", "food preferences")

        body = mock_client.request.call_args[1].get("json", {})
        assert body["query"] == "food preferences"
        assert body["scope"] == "user"
        assert body["scope_id"] == "user_1"
        assert body["limit"] == 10
        assert len(result["results"]) == 1

    @patch("steno_ai.client.httpx.Client")
    def test_search_custom_limit(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"results": [], "query": "food"}}
        )

        steno = Steno("sk_test_123")
        steno.search("user_1", "food", limit=5)

        body = mock_client.request.call_args[1].get("json", {})
        assert body["limit"] == 5


class TestFeedbackOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_feedback_positive(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.feedback("fact_1", True)

        body = mock_client.request.call_args[1].get("json", {})
        assert body["fact_id"] == "fact_1"
        assert body["was_useful"] is True
        assert body["feedback_type"] == "explicit_positive"

    @patch("steno_ai.client.httpx.Client")
    def test_feedback_negative(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.feedback("fact_1", False)

        body = mock_client.request.call_args[1].get("json", {})
        assert body["was_useful"] is False
        assert body["feedback_type"] == "explicit_negative"


class TestUsageOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_usage(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"memories_stored": 42, "searches_this_month": 100, "extractions_this_month": 10}}
        )

        steno = Steno("sk_test_123")
        result = steno.usage()

        assert result["memories_stored"] == 42


class TestErrorHandling:
    @patch("steno_ai.client.httpx.Client")
    def test_api_error_raises_steno_error(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            status_code=401,
            json_data={"error": {"code": "unauthorized", "message": "Invalid API key"}},
        )

        steno = Steno("sk_test_123")
        with pytest.raises(StenoError) as exc_info:
            steno.search("user_1", "test")

        assert exc_info.value.code == "unauthorized"
        assert exc_info.value.status == 401
        assert "Invalid API key" in str(exc_info.value)

    @patch("steno_ai.client.httpx.Client")
    def test_404_error(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            status_code=404,
            json_data={"error": {"code": "not_found", "message": "Fact not found"}},
        )

        steno = Steno("sk_test_123")
        with pytest.raises(StenoError) as exc_info:
            steno.memory.get("nonexistent")

        assert exc_info.value.code == "not_found"
        assert exc_info.value.status == 404


class TestRateLimiting:
    @patch("steno_ai.client.httpx.Client")
    @patch("steno_ai.client.time.sleep")
    def test_retries_on_429(self, mock_sleep, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        rate_limited = _mock_response(status_code=429, headers={"retry-after": "2"})
        success = _mock_response(json_data={"data": {"results": [], "query": "test"}})
        mock_client.request.side_effect = [rate_limited, success]

        steno = Steno("sk_test_123")
        result = steno.search("user_1", "test")

        mock_sleep.assert_called_once_with(2)
        assert mock_client.request.call_count == 2
        assert result == {"results": [], "query": "test"}


class TestSessionClient:
    @patch("steno_ai.client.httpx.Client")
    def test_start_session(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"id": "sess_123", "scope": "user", "scope_id": "user_1"}}
        )

        steno = Steno("sk_test_123")
        session = steno.sessions.start("user", "user_1")

        assert session["id"] == "sess_123"

    @patch("steno_ai.client.httpx.Client")
    def test_end_session(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.sessions.end("sess_123")

        call_args = mock_client.request.call_args
        assert "sess_123" in call_args[0][1]


class TestMemoryClient:
    @patch("steno_ai.client.httpx.Client")
    def test_delete_fact(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.memory.delete("fact_123")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "DELETE"

    @patch("steno_ai.client.httpx.Client")
    def test_purge_memories(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.memory.purge("user", "user_1")

        body = mock_client.request.call_args[1].get("json", {})
        assert body["scope"] == "user"
        assert body["scope_id"] == "user_1"


class TestStenoErrorRepr:
    def test_repr(self):
        err = StenoError("unauthorized", "Invalid API key", 401)
        assert "unauthorized" in repr(err)
        assert "401" in repr(err)
