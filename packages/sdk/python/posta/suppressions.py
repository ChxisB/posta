"""Suppressions — addresses the API refuses to send to. Addressable by id OR email."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request


class SuppressionsBatch:
    @classmethod
    def add(cls, params: Dict[str, Any]) -> Any:
        """POST /suppressions/batch/add — ``{"emails": [...], "origin"?: ...}``, 1..1000 emails."""
        return request("POST", "/suppressions/batch/add", body=params)

    @classmethod
    def remove(cls, params: Dict[str, Any]) -> Any:
        """POST /suppressions/batch/remove — ``{"emails": [...]}`` or ``{"ids": [...]}``."""
        return request("POST", "/suppressions/batch/remove", body=params)


class Suppressions:
    Batch = SuppressionsBatch

    @classmethod
    def add(cls, params: Dict[str, Any]) -> Any:
        """POST /suppressions — ``{"email": ..., "origin"?: bounce|complaint|manual|unsubscribe}``."""
        return request("POST", "/suppressions", body=params)

    create = add

    @classmethod
    def get(cls, id_or_email: str) -> Any:
        return request("GET", f"/suppressions/{path_id(id_or_email)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
        origin: Optional[str] = None,
    ) -> Any:
        return request("GET", "/suppressions", query=list_query(limit, after, before, origin=origin))

    @classmethod
    def remove(cls, id_or_email: str) -> Any:
        return request("DELETE", f"/suppressions/{path_id(id_or_email)}")
