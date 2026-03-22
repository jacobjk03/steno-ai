from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from steno_ai import Steno
from typing import List, Any


class StenoRetriever(BaseRetriever):
    """LangChain retriever backed by Steno memory search.

    Usage:
        retriever = StenoRetriever(api_key="sk_steno_...", user_id="user_123")
        docs = retriever.invoke("food preferences")

    With profile facts included:
        retriever = StenoRetriever(
            api_key="sk_steno_...",
            user_id="user_123",
            include_profile=True,
        )
        docs = retriever.invoke("food preferences")
        # Profile facts are returned as Documents with source="steno_profile"
    """

    steno: Any = None
    user_id: str = ""
    max_results: int = 5
    include_profile: bool = False

    def __init__(
        self,
        api_key: str,
        user_id: str,
        max_results: int = 5,
        base_url: str = None,
        include_profile: bool = False,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.steno = Steno(api_key, base_url=base_url) if base_url else Steno(api_key)
        self.user_id = user_id
        self.max_results = max_results
        self.include_profile = include_profile

    def _get_relevant_documents(self, query: str) -> List[Document]:
        """Search Steno and return as LangChain Documents.

        If include_profile is True, also fetches the user profile and
        prepends profile facts as Documents.
        """
        docs: List[Document] = []

        # Optionally include profile facts
        if self.include_profile:
            try:
                profile = self.steno.profile(self.user_id)
                for fact in profile.get("static", []):
                    docs.append(Document(
                        page_content=fact.get("content", ""),
                        metadata={
                            "category": fact.get("category", ""),
                            "fact_type": "static",
                            "source": "steno_profile",
                        },
                    ))
                for fact in profile.get("dynamic", []):
                    docs.append(Document(
                        page_content=fact.get("content", ""),
                        metadata={
                            "fact_type": "dynamic",
                            "source": "steno_profile",
                        },
                    ))
            except Exception:
                pass  # Don't fail retrieval if profile fetch fails

        # Search for relevant memories
        try:
            results = self.steno.search(self.user_id, query, limit=self.max_results)
            for r in results.get("results", []):
                docs.append(Document(
                    page_content=r.get("content", ""),
                    metadata={
                        "score": r.get("score", 0),
                        "fact_id": r.get("fact", {}).get("id", ""),
                        "source": "steno",
                    }
                ))
        except Exception:
            pass  # Don't break retrieval on search failures

        return docs
