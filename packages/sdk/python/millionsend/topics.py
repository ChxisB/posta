"""Subscription topics — granular unsubscribe categories. GET /topics is a bare
``{"data": [...]}`` (unpaginated)."""

from typing import Any, Dict

from ._client import path_id, request


class Topics:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        return request("POST", "/topics", body=params)

    @classmethod
    def get(cls, topic_id: str) -> Any:
        return request("GET", f"/topics/{path_id(topic_id)}")

    @classmethod
    def list(cls) -> Any:
        return request("GET", "/topics")

    @classmethod
    def update(cls, topic_id: str, params: Dict[str, Any]) -> Any:
        """PATCH /topics/{id} — name, description, visibility."""
        return request("PATCH", f"/topics/{path_id(topic_id)}", body=params)

    @classmethod
    def remove(cls, topic_id: str) -> Any:
        return request("DELETE", f"/topics/{path_id(topic_id)}")
