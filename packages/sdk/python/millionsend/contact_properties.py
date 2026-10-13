"""Custom contact property definitions (``key`` + ``type`` string|number)."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request, split_id


class ContactProperties:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /contact-properties — key, type (string|number), fallback_value?"""
        return request("POST", "/contact-properties", body=params)

    @classmethod
    def get(cls, property_id: str) -> Any:
        return request("GET", f"/contact-properties/{path_id(property_id)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/contact-properties", query=list_query(limit, after, before))

    @classmethod
    def update(cls, params: Dict[str, Any]) -> Any:
        """PATCH /contact-properties/{id} — ``{"id": ..., "fallback_value": ...}`` (None clears)."""
        property_id, body = split_id(params, "id")
        return request("PATCH", f"/contact-properties/{property_id}", body=body)

    @classmethod
    def remove(cls, property_id: str) -> Any:
        return request("DELETE", f"/contact-properties/{path_id(property_id)}")
