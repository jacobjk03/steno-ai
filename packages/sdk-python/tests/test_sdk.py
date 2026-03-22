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


class TestProfileOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_profile(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"user_id": "user_1", "facts": ["Loves pizza"]}}
        )

        steno = Steno("sk_test_123")
        result = steno.profile("user_1")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "scope=user" in call_args[0][1]
        assert "scope_id=user_1" in call_args[0][1]
        assert result["user_id"] == "user_1"


class TestUpdateOneLiner:
    @patch("steno_ai.client.httpx.Client")
    def test_update(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"id": "fact_1", "content": "Updated content"}}
        )

        steno = Steno("sk_test_123")
        result = steno.update("fact_1", "Updated content")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "PATCH"
        assert "fact_1" in call_args[0][1]
        body = call_args[1].get("json", {})
        assert body["content"] == "Updated content"
        assert result["content"] == "Updated content"


class TestMemoryClientUpdate:
    @patch("steno_ai.client.httpx.Client")
    def test_update(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"id": "fact_1", "content": "New text"}}
        )

        steno = Steno("sk_test_123")
        result = steno.memory.update("fact_1", "New text")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "PATCH"
        assert "fact_1" in call_args[0][1]
        assert result["content"] == "New text"


class TestMemoryClientList:
    @patch("steno_ai.client.httpx.Client")
    def test_list(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"items": [{"id": "f1"}], "cursor": "abc"}}
        )

        steno = Steno("sk_test_123")
        result = steno.memory.list("user", "user_1", limit=5)

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "scope=user" in call_args[0][1]
        assert "scope_id=user_1" in call_args[0][1]
        assert "limit=5" in call_args[0][1]
        assert len(result["items"]) == 1

    @patch("steno_ai.client.httpx.Client")
    def test_list_with_cursor(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"items": [], "cursor": None}}
        )

        steno = Steno("sk_test_123")
        steno.memory.list("user", "user_1", cursor="abc")

        call_args = mock_client.request.call_args
        assert "cursor=abc" in call_args[0][1]


class TestMemoryClientExport:
    @patch("steno_ai.client.httpx.Client")
    def test_export(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"items": [{"id": "f1"}]}}
        )

        steno = Steno("sk_test_123")
        result = steno.memory.export("user", "user_1")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "/v1/export" in call_args[0][1]
        assert "scope=user" in call_args[0][1]
        assert len(result["items"]) == 1


class TestMemoryClientBatch:
    @patch("steno_ai.client.httpx.Client")
    def test_add_batch(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"processed": 2}}
        )

        steno = Steno("sk_test_123")
        items = [
            {"scope": "user", "scope_id": "u1", "data": "fact 1"},
            {"scope": "user", "scope_id": "u1", "data": "fact 2"},
        ]
        result = steno.memory.add_batch(items)

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "POST"
        assert "/v1/memory/batch" in call_args[0][1]
        body = call_args[1].get("json", {})
        assert len(body["items"]) == 2
        assert result["processed"] == 2

    @patch("steno_ai.client.httpx.Client")
    def test_search_batch(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"results": [[], []]}}
        )

        steno = Steno("sk_test_123")
        queries = [
            {"query": "food", "scope": "user", "scope_id": "u1"},
            {"query": "work", "scope": "user", "scope_id": "u1"},
        ]
        result = steno.memory.search_batch(queries)

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "POST"
        assert "/v1/memory/search/batch" in call_args[0][1]
        body = call_args[1].get("json", {})
        assert len(body["queries"]) == 2


class TestGraphClient:
    @patch("steno_ai.client.httpx.Client")
    def test_list_entities(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"items": [{"id": "ent_1", "name": "Pizza"}]}}
        )

        steno = Steno("sk_test_123")
        result = steno.graph.list_entities(limit=10)

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "limit=10" in call_args[0][1]
        assert len(result["items"]) == 1

    @patch("steno_ai.client.httpx.Client")
    def test_list_entities_with_cursor(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"items": []}}
        )

        steno = Steno("sk_test_123")
        steno.graph.list_entities(cursor="xyz")

        call_args = mock_client.request.call_args
        assert "cursor=xyz" in call_args[0][1]

    @patch("steno_ai.client.httpx.Client")
    def test_get_entity(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"id": "ent_1", "name": "Pizza"}}
        )

        steno = Steno("sk_test_123")
        result = steno.graph.get_entity("ent_1")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "ent_1" in call_args[0][1]
        assert result["name"] == "Pizza"

    @patch("steno_ai.client.httpx.Client")
    def test_get_related(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"entity": "ent_1", "related": [{"id": "ent_2"}]}}
        )

        steno = Steno("sk_test_123")
        result = steno.graph.get_related("ent_1", depth=2)

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert "ent_1" in call_args[0][1]
        assert "depth=2" in call_args[0][1]
        assert len(result["related"]) == 1


class TestWebhookClient:
    @patch("steno_ai.client.httpx.Client")
    def test_create_webhook(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": {"id": "wh_1", "url": "https://example.com/hook"}}
        )

        steno = Steno("sk_test_123")
        result = steno.webhooks.create(
            url="https://example.com/hook",
            events=["memory.created"],
            secret="whsec_123",
        )

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "POST"
        body = call_args[1].get("json", {})
        assert body["url"] == "https://example.com/hook"
        assert body["events"] == ["memory.created"]
        assert body["secret"] == "whsec_123"
        assert result["id"] == "wh_1"

    @patch("steno_ai.client.httpx.Client")
    def test_list_webhooks(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(
            json_data={"data": [{"id": "wh_1"}, {"id": "wh_2"}]}
        )

        steno = Steno("sk_test_123")
        result = steno.webhooks.list()

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "GET"
        assert len(result) == 2

    @patch("steno_ai.client.httpx.Client")
    def test_delete_webhook(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.request.return_value = _mock_response(status_code=204)

        steno = Steno("sk_test_123")
        steno.webhooks.delete("wh_1")

        call_args = mock_client.request.call_args
        assert call_args[0][0] == "DELETE"
        assert "wh_1" in call_args[0][1]


class TestStenoSubClients:
    def test_creates_all_sub_clients(self):
        steno = Steno("sk_test_123")
        assert steno.memory is not None
        assert steno.sessions is not None
        assert steno.triggers is not None
        assert steno.keys is not None
        assert steno.graph is not None
        assert steno.webhooks is not None


class TestStenoErrorRepr:
    def test_repr(self):
        err = StenoError("unauthorized", "Invalid API key", 401)
        assert "unauthorized" in repr(err)
        assert "401" in repr(err)
