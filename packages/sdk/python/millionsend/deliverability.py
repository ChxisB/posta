"""Account-level deliverability score over the trailing window."""

from typing import Any

from ._client import request


class Deliverability:
    @classmethod
    def get(cls) -> Any:
        """GET /deliverability — scores are null until there is enough data."""
        return request("GET", "/deliverability")
