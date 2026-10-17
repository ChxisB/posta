"""Request wiring, config, and error parsing over the mocked HTTP layer."""

import pytest
import requests

import posta
from posta import (
    MissingApiKeyError,
    NotFoundError,
    PostaError,
    ValidationError,
    _client,
)


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.setattr(posta, "api_key", None)
    monkeypatch.delenv("POSTA_API_KEY", raising=False)
    with pytest.raises(MissingApiKeyError):
        posta.Emails.get("e1")


def test_api_key_from_env(monkeypatch):
    monkeypatch.setattr(posta, "api_key", None)
    monkeypatch.setenv("POSTA_API_KEY", "po_env")

    calls = []

    def fake(method, url, headers=None, **kw):
        calls.append(headers["Authorization"])

        class R:
            status_code = 200
            text = "{}"

        return R()

    monkeypatch.setattr(posta, "base_url", "https://api.test")
    monkeypatch.setattr(_client.requests, "request", fake)
    posta.Emails.get("e1")
    assert calls[0] == "Bearer po_env"


def test_base_url_default_and_trailing_slash(monkeypatch):
    monkeypatch.setattr(posta, "api_key", "po_test")
    monkeypatch.setattr(posta, "base_url", "https://api.test/")
    seen = {}

    def fake(method, url, headers=None, **kw):
        seen["url"] = url

        class R:
            status_code = 200
            text = "{}"

        return R()

    monkeypatch.setattr(_client.requests, "request", fake)
    posta.Emails.get("e1")
    assert seen["url"] == "https://api.test/emails/e1"


def test_base_url_defaults_to_cloud_then_env_then_option(http, monkeypatch):
    monkeypatch.setattr(posta, "base_url", None)
    monkeypatch.delenv("POSTA_BASE_URL", raising=False)
    posta.Emails.get("e1")
    assert http.calls[0]["url"] == "https://api.posta.example/emails/e1"

    monkeypatch.setenv("POSTA_BASE_URL", "https://mail.example.com")
    posta.Emails.get("e1")
    assert http.calls[1]["url"] == "https://mail.example.com/emails/e1"

    monkeypatch.setattr(posta, "base_url", "https://api.test")
    posta.Emails.get("e1")
    assert http.calls[2]["url"] == "https://api.test/emails/e1"


def test_refuses_non_loopback_http_unless_allowed(http, monkeypatch):
    monkeypatch.setattr(posta, "allow_insecure_http", False)
    for base in ("http://mail.example.com", "http://mail.example.com/"):
        monkeypatch.setattr(posta, "base_url", base)
        with pytest.raises(PostaError, match="allow_insecure_http"):
            posta.Emails.get("e1")
    assert http.calls == []

    monkeypatch.setattr(posta, "base_url", None)
    monkeypatch.setenv("POSTA_BASE_URL", "http://mail.example.com")
    with pytest.raises(PostaError, match="allow_insecure_http"):
        posta.Emails.get("e1")

    monkeypatch.setattr(posta, "allow_insecure_http", True)
    posta.Emails.get("e1")
    assert http.calls[-1]["url"] == "http://mail.example.com/emails/e1"

    monkeypatch.setattr(posta, "allow_insecure_http", False)
    for base in ("http://localhost:3001", "http://127.0.0.1:3001"):
        monkeypatch.setattr(posta, "base_url", base)
        posta.Emails.get("e1")


def test_auth_accept_user_agent_and_content_type(http):
    posta.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "html": "<p>h</p>"})
    h = http.calls[0]["headers"]
    assert h["Authorization"] == "Bearer po_test"
    assert h["Accept"] == "application/json"
    assert h["Content-Type"] == "application/json"
    assert h["User-Agent"].startswith("posta-python/")


def test_no_content_type_on_get(http):
    posta.Emails.get("e1")
    assert "Content-Type" not in http.calls[0]["headers"]


def test_idempotency_key_on_post_only(http):
    posta.Emails.send(
        {"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"},
        idempotency_key="key-123",
    )
    assert http.calls[0]["headers"]["Idempotency-Key"] == "key-123"


def test_returns_wrapped_dict_with_attribute_access(http):
    http.body = {"id": "abc", "data": [{"id": "1"}]}
    res = posta.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"})
    assert res["id"] == "abc"
    assert res.id == "abc"
    assert res.data[0].id == "1"


def test_error_parsed_into_typed_exception(http):
    http.status = 422
    http.body = {"statusCode": 422, "name": "validation_error", "message": "bad"}
    with pytest.raises(ValidationError) as ei:
        posta.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"})
    assert ei.value.code == "validation_error"
    assert ei.value.message == "bad"
    assert ei.value.status_code == 422
    assert isinstance(ei.value, PostaError)


def test_not_found_maps_to_subclass(http):
    http.status = 404
    http.body = {"statusCode": 404, "name": "not_found", "message": "nope"}
    with pytest.raises(NotFoundError):
        posta.Emails.get("missing")


def test_non_canonical_body_falls_back(http):
    http.status = 500
    http.body = "gateway boom"
    with pytest.raises(PostaError) as ei:
        posta.Emails.get("e1")
    assert ei.value.code == "application_error"
    assert ei.value.status_code == 500
    assert ei.value.message == "Request failed with status 500"


def test_transport_failure_has_status_code_none(http):
    http.exc = requests.exceptions.ConnectionError("ECONNREFUSED")
    with pytest.raises(PostaError) as ei:
        posta.Emails.get("e1")
    assert ei.value.status_code is None
    assert "ECONNREFUSED" in ei.value.message
    # transport failures are the base error, never a typed API subclass
    assert type(ei.value) is PostaError


def test_options_dict_resend_shape_and_positional_string(http):
    params = {"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"}
    posta.Emails.send(params, {"idempotency_key": "dict-key"})
    assert http.calls[0]["headers"]["Idempotency-Key"] == "dict-key"

    posta.Emails.send(params, "positional-key")
    assert http.calls[1]["headers"]["Idempotency-Key"] == "positional-key"

    posta.Emails.send(params, {"idempotency_key": "dict-key"}, idempotency_key="kw-key")
    assert http.calls[2]["headers"]["Idempotency-Key"] == "kw-key"

    posta.Emails.send(params)
    assert "Idempotency-Key" not in http.calls[3]["headers"]
    assert "x-batch-validation" not in http.calls[3]["headers"]


def test_batch_validation_header_post_only(http):
    items = [{"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"}]
    posta.Batch.send(items, batch_validation="permissive")
    assert http.calls[0]["headers"]["x-batch-validation"] == "permissive"
    assert "Idempotency-Key" not in http.calls[0]["headers"]

    posta.Batch.send(items, {"batch_validation": "strict", "idempotency_key": "b-1"})
    assert http.calls[1]["headers"]["x-batch-validation"] == "strict"
    assert http.calls[1]["headers"]["Idempotency-Key"] == "b-1"

    posta.Batch.send(items)
    assert "x-batch-validation" not in http.calls[2]["headers"]

    _client.request("GET", "/emails", idempotency_key="k", batch_validation="permissive")
    assert "x-batch-validation" not in http.calls[3]["headers"]
    assert "Idempotency-Key" not in http.calls[3]["headers"]


def test_list_accepts_resend_params_dict(http):
    posta.Domains.list({"limit": 5, "after": "cur"})
    assert http.calls[0]["params"] == {"limit": 5, "after": "cur"}

    posta.Suppressions.list({"origin": "bounce", "before": None})
    assert http.calls[1]["params"] == {"origin": "bounce"}

    posta.Domains.list({})
    assert http.calls[2]["params"] is None


def test_every_api_error_name_maps_to_a_subclass(http):
    cases = {
        "missing_api_key": (401, posta.MissingApiKeyError),
        "invalid_api_key": (401, posta.InvalidApiKeyError),
        "restricted_api_key": (403, posta.RestrictedApiKeyError),
        "forbidden": (403, posta.ForbiddenError),
        "invalid_parameter": (400, posta.InvalidParameterError),
        "invalid_payload": (400, posta.InvalidPayloadError),
        "all_recipients_suppressed": (422, posta.AllRecipientsSuppressedError),
        "payload_too_large": (413, posta.PayloadTooLargeError),
        "conflict": (409, posta.ConflictError),
        "concurrent_idempotent_requests": (409, posta.ConcurrentIdempotentRequestsError),
        "invalid_idempotent_request": (409, posta.InvalidIdempotentRequestError),
        "rate_limit_exceeded": (429, posta.RateLimitExceededError),
        "daily_quota_exceeded": (429, posta.DailyQuotaExceededError),
        "plan_limit_reached": (402, posta.PlanLimitReachedError),
        "sending_paused": (403, posta.SendingPausedError),
        "internal_server_error": (500, posta.InternalServerError),
        "application_error": (500, posta.ApplicationError),
    }
    for name, (status, cls) in cases.items():
        http.status = status
        http.body = {"statusCode": status, "name": name, "message": name}
        with pytest.raises(cls) as ei:
            posta.Emails.get("e1")
        assert ei.value.code == name
        assert ei.value.status_code == status
        assert isinstance(ei.value, PostaError)
