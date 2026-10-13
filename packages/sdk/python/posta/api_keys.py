"""API keys. The ``token`` is only returned by ``create``."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request


class ApiKeys:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /api-keys — name, permission? (full_access|sending_access), domain_id?"""
        return request("POST", "/api-keys", body=params)

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/api-keys", query=list_query(limit, after, before))

    @classmethod
    def remove(cls, api_key_id: str) -> Any:
        return request("DELETE", f"/api-keys/{path_id(api_key_id)}")
