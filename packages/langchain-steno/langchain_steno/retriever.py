from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from steno_ai import Steno
from typing import List, Any


class StenoRetriever(BaseRetriever):
    """LangChain retriever backed by Steno memory search.

    Usage:
        retriever = StenoRetriever(api_key="sk_steno_...", user_id="user_123")
        docs = retriever.invoke("food preferences")
    """

    steno: Any = None
    user_id: str = ""
    max_results: int = 5

    def __init__(self, api_key: str, user_id: str, max_results: int = 5, base_url: str = None, **kwargs):
        super().__init__(**kwargs)
        self.steno = Steno(api_key, base_url=base_url) if base_url else Steno(api_key)
        self.user_id = user_id
        self.max_results = max_results

    def _get_relevant_documents(self, query: str) -> List[Document]:
        """Search Steno and return as LangChain Documents."""
        try:
            results = self.steno.search(self.user_id, query, limit=self.max_results)
            docs = []
            for r in results.get("results", []):
                docs.append(Document(
                    page_content=r.get("content", ""),
                    metadata={
                        "score": r.get("score", 0),
                        "fact_id": r.get("fact", {}).get("id", ""),
                        "source": "steno",
                    }
                ))
            return docs
        except Exception:
            return []
