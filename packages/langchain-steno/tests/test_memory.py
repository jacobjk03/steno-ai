"""Tests for langchain-steno: StenoMemory and StenoRetriever."""

import pytest
from unittest.mock import MagicMock, patch
from langchain_steno.memory import StenoMemory
from langchain_steno.retriever import StenoRetriever
from langchain_core.documents import Document


# ── Fixtures ──


@pytest.fixture
def mock_steno():
    """Create a mock Steno client."""
    steno = MagicMock()
    steno.search.return_value = {
        "results": [
            {
                "content": "User loves pizza",
                "score": 0.95,
                "fact": {"id": "fact_1"},
            },
            {
                "content": "User works at Google",
                "score": 0.80,
                "fact": {"id": "fact_2"},
            },
        ]
    }
    steno.add.return_value = {"status": "ok"}
    steno.memory.purge.return_value = None
    return steno


@pytest.fixture
def memory(mock_steno):
    """Create a StenoMemory with mocked Steno client."""
    with patch("langchain_steno.memory.Steno") as MockSteno:
        MockSteno.return_value = mock_steno
        mem = StenoMemory(api_key="sk_steno_test", user_id="user_123")
    return mem


@pytest.fixture
def retriever(mock_steno):
    """Create a StenoRetriever with mocked Steno client."""
    with patch("langchain_steno.retriever.Steno") as MockSteno:
        MockSteno.return_value = mock_steno
        ret = StenoRetriever(api_key="sk_steno_test", user_id="user_123")
    return ret


# ── StenoMemory Tests ──


class TestStenoMemory:
    def test_memory_variables(self, memory):
        assert memory.memory_variables == ["history"]

    def test_load_memory_variables_searches_steno(self, memory, mock_steno):
        result = memory.load_memory_variables({"input": "food preferences"})

        mock_steno.search.assert_called_once_with("user_123", "food preferences", limit=5)
        assert "history" in result
        assert "User loves pizza" in result["history"]
        assert "User works at Google" in result["history"]
        assert result["history"].startswith("Relevant memories:")

    def test_load_memory_variables_empty_query(self, memory, mock_steno):
        result = memory.load_memory_variables({"input": ""})

        mock_steno.search.assert_not_called()
        assert result == {"history": ""}

    def test_load_memory_variables_missing_input_key(self, memory, mock_steno):
        result = memory.load_memory_variables({"other_key": "something"})

        mock_steno.search.assert_not_called()
        assert result == {"history": ""}

    def test_load_memory_variables_no_results(self, memory, mock_steno):
        mock_steno.search.return_value = {"results": []}

        result = memory.load_memory_variables({"input": "unknown topic"})

        assert result == {"history": ""}

    def test_load_memory_variables_handles_search_failure(self, memory, mock_steno):
        mock_steno.search.side_effect = Exception("API error")

        result = memory.load_memory_variables({"input": "food preferences"})

        assert result == {"history": ""}

    def test_save_context_stores_conversation(self, memory, mock_steno):
        memory.save_context(
            {"input": "I love pizza"},
            {"output": "Got it! I'll remember that."},
        )

        mock_steno.add.assert_called_once_with("user_123", [
            {"role": "user", "content": "I love pizza"},
            {"role": "assistant", "content": "Got it! I'll remember that."},
        ])

    def test_save_context_skips_empty_input(self, memory, mock_steno):
        memory.save_context({"input": ""}, {"output": "something"})

        mock_steno.add.assert_not_called()

    def test_save_context_skips_empty_output(self, memory, mock_steno):
        memory.save_context({"input": "something"}, {"output": ""})

        mock_steno.add.assert_not_called()

    def test_save_context_handles_failure(self, memory, mock_steno):
        mock_steno.add.side_effect = Exception("API error")

        # Should not raise
        memory.save_context(
            {"input": "I love pizza"},
            {"output": "Got it!"},
        )

    def test_clear_purges_memories(self, memory, mock_steno):
        memory.clear()

        mock_steno.memory.purge.assert_called_once_with("user", "user_123")

    def test_clear_handles_failure(self, memory, mock_steno):
        mock_steno.memory.purge.side_effect = Exception("API error")

        # Should not raise
        memory.clear()

    def test_custom_memory_key(self, mock_steno):
        with patch("langchain_steno.memory.Steno") as MockSteno:
            MockSteno.return_value = mock_steno
            mem = StenoMemory(
                api_key="sk_steno_test",
                user_id="user_123",
                memory_key="steno_context",
            )

        assert mem.memory_variables == ["steno_context"]
        result = mem.load_memory_variables({"input": "food"})
        assert "steno_context" in result

    def test_custom_max_memories(self, mock_steno):
        with patch("langchain_steno.memory.Steno") as MockSteno:
            MockSteno.return_value = mock_steno
            mem = StenoMemory(
                api_key="sk_steno_test",
                user_id="user_123",
                max_memories=3,
            )

        mem.load_memory_variables({"input": "food"})
        mock_steno.search.assert_called_once_with("user_123", "food", limit=3)


# ── StenoRetriever Tests ──


class TestStenoRetriever:
    def test_get_relevant_documents_returns_documents(self, retriever, mock_steno):
        docs = retriever._get_relevant_documents("food preferences")

        mock_steno.search.assert_called_once_with("user_123", "food preferences", limit=5)
        assert len(docs) == 2
        assert all(isinstance(d, Document) for d in docs)

        assert docs[0].page_content == "User loves pizza"
        assert docs[0].metadata["score"] == 0.95
        assert docs[0].metadata["fact_id"] == "fact_1"
        assert docs[0].metadata["source"] == "steno"

        assert docs[1].page_content == "User works at Google"
        assert docs[1].metadata["score"] == 0.80
        assert docs[1].metadata["fact_id"] == "fact_2"

    def test_get_relevant_documents_empty_results(self, retriever, mock_steno):
        mock_steno.search.return_value = {"results": []}

        docs = retriever._get_relevant_documents("unknown topic")

        assert docs == []

    def test_get_relevant_documents_handles_error(self, retriever, mock_steno):
        mock_steno.search.side_effect = Exception("API error")

        docs = retriever._get_relevant_documents("food preferences")

        assert docs == []

    def test_custom_max_results(self, mock_steno):
        with patch("langchain_steno.retriever.Steno") as MockSteno:
            MockSteno.return_value = mock_steno
            ret = StenoRetriever(
                api_key="sk_steno_test",
                user_id="user_123",
                max_results=3,
            )

        ret._get_relevant_documents("food")
        mock_steno.search.assert_called_once_with("user_123", "food", limit=3)

    def test_missing_fact_fields(self, retriever, mock_steno):
        mock_steno.search.return_value = {
            "results": [
                {"content": "Some memory"},  # No score or fact fields
            ]
        }

        docs = retriever._get_relevant_documents("query")

        assert len(docs) == 1
        assert docs[0].page_content == "Some memory"
        assert docs[0].metadata["score"] == 0
        assert docs[0].metadata["fact_id"] == ""
        assert docs[0].metadata["source"] == "steno"
