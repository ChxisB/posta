"""Plan limits and today's send count (MillionSend extension)."""

from typing import Any

from ._client import request


class Usage:
    @classmethod
    def get(cls) -> Any:
        """GET /usage — ``plan`` and ``limits`` are null when self-hosted."""
        return request("GET", "/usage")
