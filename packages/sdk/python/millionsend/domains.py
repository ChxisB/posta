"""Sending domains — create returns the DNS records to publish; verify re-checks them."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request, split_id


class Domains:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /domains — name, region?, custom_return_path?, open_tracking?, click_tracking?, tracking_subdomain?"""
        return request("POST", "/domains", body=params)

    @classmethod
    def get(cls, domain_id: str) -> Any:
        return request("GET", f"/domains/{path_id(domain_id)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/domains", query=list_query(limit, after, before))

    @classmethod
    def update(cls, params: Dict[str, Any]) -> Any:
        """PATCH /domains/{id} — ``{"id": ..., "open_tracking"?, "click_tracking"?, "tracking_subdomain"?}``."""
        domain_id, body = split_id(params, "id")
        return request("PATCH", f"/domains/{domain_id}", body=body)

    @classmethod
    def remove(cls, domain_id: str) -> Any:
        return request("DELETE", f"/domains/{path_id(domain_id)}")

    @classmethod
    def verify(cls, domain_id: str) -> Any:
        """POST /domains/{id}/verify"""
        return request("POST", f"/domains/{path_id(domain_id)}/verify")
