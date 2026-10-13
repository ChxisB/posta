"""Broadcasts — draft, schedule, send, and cancel campaigns.

Targeting is an optional ``segment_id`` and/or ``topic_id`` on create/update;
neither set means every contact of the team. ``update`` and ``send`` take
``(broadcast_id, ...)`` or resend-python's single ``{"broadcast_id": ..., **fields}`` dict.
"""

from typing import Any, Dict, Optional, Tuple, Union

from ._client import list_query, path_id, request, split_id

Target = Union[str, Dict[str, Any]]


def _target(broadcast_id: Target, body: Optional[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    if isinstance(broadcast_id, dict):
        return split_id(broadcast_id, "broadcast_id", "id")
    return path_id(broadcast_id), dict(body or {})


class Broadcasts:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        return request("POST", "/broadcasts", body=params)

    @classmethod
    def get(cls, broadcast_id: str) -> Any:
        return request("GET", f"/broadcasts/{path_id(broadcast_id)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/broadcasts", query=list_query(limit, after, before))

    @classmethod
    def update(cls, broadcast_id: Target, params: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /broadcasts/{id} — draft only."""
        ident, body = _target(broadcast_id, params)
        return request("PATCH", f"/broadcasts/{ident}", body=body)

    @classmethod
    def remove(cls, broadcast_id: str) -> Any:
        """DELETE /broadcasts/{id} — draft only."""
        return request("DELETE", f"/broadcasts/{path_id(broadcast_id)}")

    @classmethod
    def send(cls, broadcast_id: Target, scheduled_at: Optional[str] = None) -> Any:
        """POST /broadcasts/{id}/send — omit scheduled_at to send now."""
        ident, body = _target(
            broadcast_id, {"scheduled_at": scheduled_at} if scheduled_at is not None else {}
        )
        return request("POST", f"/broadcasts/{ident}/send", body=body)

    @classmethod
    def cancel(cls, broadcast_id: str) -> Any:
        """POST /broadcasts/{id}/cancel — scheduled only."""
        return request("POST", f"/broadcasts/{path_id(broadcast_id)}/cancel")
