"""Webhook endpoints. ``get`` returns the ``signing_secret``; list entries do not."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request, split_id


class Webhooks:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /webhooks — endpoint, events[], signing_secret? (whsec_… to reuse instead of minting)."""
        return request("POST", "/webhooks", body=params)

    @classmethod
    def get(cls, webhook_id: str) -> Any:
        return request("GET", f"/webhooks/{path_id(webhook_id)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/webhooks", query=list_query(limit, after, before))

    @classmethod
    def update(cls, params: Dict[str, Any]) -> Any:
        """PATCH /webhooks/{id} — ``{"webhook_id" | "id": ..., "endpoint"?, "events"?, "status"?}``."""
        webhook_id, body = split_id(params, "webhook_id", "id")
        return request("PATCH", f"/webhooks/{webhook_id}", body=body)

    @classmethod
    def remove(cls, webhook_id: str) -> Any:
        return request("DELETE", f"/webhooks/{path_id(webhook_id)}")

    @classmethod
    def rotate(cls, webhook_id: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """POST /webhooks/{id}/rotate — ``{"signing_secret"?: "whsec_…", "overlap_hours"?: 0..72}``.

        Returns the new ``signing_secret``; ``previous_secret_expires_at`` is when the old one
        stops co-signing deliveries (``None`` when ``overlap_hours`` is 0).
        """
        return request("POST", f"/webhooks/{path_id(webhook_id)}/rotate", body=params or {})
