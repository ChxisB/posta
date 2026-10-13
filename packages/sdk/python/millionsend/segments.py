"""Dynamic segments — a saved filter over the team's contacts (MillionSend
extension, no Resend equivalent). ``get`` returns a live ``contact_count``.
``filter`` is optional; ``None`` clears it."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request


class Segments:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /segments — name, filter?"""
        return request("POST", "/segments", body=params)

    @classmethod
    def get(cls, segment_id: str) -> Any:
        return request("GET", f"/segments/{path_id(segment_id)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/segments", query=list_query(limit, after, before))

    @classmethod
    def update(cls, segment_id: str, params: Dict[str, Any]) -> Any:
        """PATCH /segments/{id} — name?, filter?"""
        return request("PATCH", f"/segments/{path_id(segment_id)}", body=params)

    @classmethod
    def remove(cls, segment_id: str) -> Any:
        return request("DELETE", f"/segments/{path_id(segment_id)}")
