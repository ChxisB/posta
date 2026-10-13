"""HTTP layer: config resolution, request dispatch, response wrapping.

Config (``api_key``, ``base_url``, ``timeout``) lives on the top-level
``millionsend`` package and is read here at call time, so setting
``millionsend.api_key = "..."`` — or the env vars — takes effect for every
resource call without re-instantiating anything.
"""

import json
import os
from typing import Any, Dict, Optional, Tuple, Union
from urllib.parse import quote, urlsplit

import requests

from .errors import MillionSendError, MissingApiKeyError, raise_api_error

VERSION = "0.8.0"
DEFAULT_BASE_URL = "https://api.millionsend.com"
DEFAULT_TIMEOUT = 60.0

_JSON_METHODS = ("POST", "PATCH")
_LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "::1")

# resend-python's per-request options dict; a bare string is the positional
# idempotency key accepted by earlier releases.
Options = Union[str, Dict[str, Any], None]


def is_insecure_http_url(url: str) -> bool:
    """True for an ``http://`` URL whose host is not loopback."""
    parts = urlsplit(url)
    if parts.scheme != "http":
        return False
    host = (parts.hostname or "").lower()
    return host not in _LOOPBACK_HOSTS and not host.startswith("127.")


class Response(dict):
    """A ``dict`` that also allows attribute access (``resp.id`` == ``resp["id"]``).

    Nested dicts and list items are wrapped too, so ``resp.data[0].id`` works.
    """

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _wrap(value: Any) -> Any:
    if isinstance(value, dict):
        return Response({k: _wrap(v) for k, v in value.items()})
    if isinstance(value, list):
        return [_wrap(v) for v in value]
    return value


def _config(name: str) -> Any:
    import millionsend  # partial at import time, fully populated at call time

    return getattr(millionsend, name, None)


def _api_key() -> str:
    key = _config("api_key") or os.environ.get("MILLIONSEND_API_KEY")
    if not key:
        raise MissingApiKeyError(
            "Missing API key. Set millionsend.api_key or the MILLIONSEND_API_KEY env var."
        )
    return key


def _base_url() -> str:
    base = _config("base_url") or os.environ.get("MILLIONSEND_BASE_URL") or DEFAULT_BASE_URL
    base = base.rstrip("/")
    # The API key travels as a bearer header, so plain http is loopback-only by default.
    if not _config("allow_insecure_http") and is_insecure_http_url(base):
        raise MillionSendError(
            f"Refusing to send the API key over plain http to {base}. "
            "Use https, or set millionsend.allow_insecure_http = True.",
            code="application_error",
            status_code=None,
        )
    return base


def path_id(value: Any) -> str:
    """Percent-encode one path segment (ids, emails, aliases)."""
    return quote(str(value), safe="")


def split_id(params: Dict[str, Any], *keys: str) -> Tuple[str, Dict[str, Any]]:
    """Pop the target id out of a resend-python style ``{"id": ..., **fields}`` dict.

    Every key in ``keys`` is removed from the body; the first one with a value is the id.
    """
    body = dict(params)
    found = [body.pop(key) for key in keys if key in body]
    ident = next((value for value in found if value is not None), None)
    if ident is None:
        raise ValueError(f"params must include one of: {', '.join(keys)}")
    return path_id(ident), body


def list_query(
    limit: Union[int, Dict[str, Any], None] = None,
    after: Optional[str] = None,
    before: Optional[str] = None,
    **extra: Any,
) -> Optional[Dict[str, Any]]:
    """Flatten keyset list options into a query map (None values dropped).

    ``limit`` may instead be the whole options dict — resend-python's
    ``list({"limit": 10, "after": ...})`` shape.
    """
    if isinstance(limit, dict):
        query: Dict[str, Any] = dict(limit)
    else:
        query = {"limit": limit, "after": after, "before": before}
    query.update({k: v for k, v in extra.items() if v is not None})
    query = {k: v for k, v in query.items() if v is not None}
    return query or None


def request_options(
    options: Options = None,
    idempotency_key: Optional[str] = None,
    batch_validation: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    """Merge the options dict with the explicit keywords (keywords win)."""
    merged = {"idempotency_key": options} if isinstance(options, str) else dict(options or {})
    if idempotency_key is not None:
        merged["idempotency_key"] = idempotency_key
    if batch_validation is not None:
        merged["batch_validation"] = batch_validation
    return {
        "idempotency_key": merged.get("idempotency_key"),
        "batch_validation": merged.get("batch_validation"),
    }


def request(
    method: str,
    path: str,
    *,
    body: Any = None,
    query: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
    batch_validation: Optional[str] = None,
) -> Any:
    """Dispatch one request and return the wrapped JSON body, or raise on error."""
    url = _base_url() + path
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Accept": "application/json",
        "User-Agent": f"millionsend-python/{VERSION}",
    }
    data = None
    if body is not None and method in _JSON_METHODS:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body)
    # Idempotency and batch validation are POST-only on the wire; sending them elsewhere is a no-op.
    if idempotency_key and method == "POST":
        headers["Idempotency-Key"] = idempotency_key
    if batch_validation and method == "POST":
        headers["x-batch-validation"] = batch_validation

    try:
        resp = requests.request(
            method,
            url,
            headers=headers,
            data=data,
            params=query,
            timeout=_config("timeout") or DEFAULT_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        raise MillionSendError(
            str(exc) or "request failed", code="application_error", status_code=None
        ) from exc

    text = resp.text
    parsed: Any = None
    if text:
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = text

    if not 200 <= resp.status_code < 300:
        raise_api_error(resp.status_code, parsed)
    return _wrap(parsed)
