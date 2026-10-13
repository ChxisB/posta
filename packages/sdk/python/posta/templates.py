"""Email templates, addressable by id OR alias. ``None`` for ``alias`` /
``subject`` / ``text`` in an update clears the field. ``from``, ``reply_to``
and ``variables`` are forwarded as given; the server answers 422 for them."""

from typing import Any, Dict, Optional

from ._client import list_query, path_id, request, split_id


class Templates:
    @classmethod
    def create(cls, params: Dict[str, Any]) -> Any:
        """POST /templates — name, html, subject?, text?, alias? (+ from, reply_to, variables passed through)"""
        return request("POST", "/templates", body=params)

    @classmethod
    def get(cls, id_or_alias: str) -> Any:
        return request("GET", f"/templates/{path_id(id_or_alias)}")

    @classmethod
    def list(
        cls,
        limit: Optional[int] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Any:
        return request("GET", "/templates", query=list_query(limit, after, before))

    @classmethod
    def update(cls, params: Dict[str, Any]) -> Any:
        """PATCH /templates/{idOrAlias} — ``{"id": ..., "name"?, "html"?, "subject"?, "text"?, "alias"?}``."""
        template_id, body = split_id(params, "id")
        return request("PATCH", f"/templates/{template_id}", body=body)

    @classmethod
    def remove(cls, id_or_alias: str) -> Any:
        return request("DELETE", f"/templates/{path_id(id_or_alias)}")

    @classmethod
    def publish(cls, id_or_alias: str) -> Any:
        """POST /templates/{idOrAlias}/publish — templates are always published; kept for Resend compatibility."""
        return request("POST", f"/templates/{path_id(id_or_alias)}/publish")

    @classmethod
    def duplicate(cls, id_or_alias: str) -> Any:
        """POST /templates/{idOrAlias}/duplicate"""
        return request("POST", f"/templates/{path_id(id_or_alias)}/duplicate")
