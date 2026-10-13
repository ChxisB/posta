"""Request wiring, config, and error parsing over the mocked HTTP layer."""

import pytest
import requests

import millionsend
from millionsend import (
    MillionSendError,
    MissingApiKeyError,
    NotFoundError,
    ValidationError,
    _client,
)


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.setattr(millionsend, "api_key", None)
    monkeypatch.delenv("MILLIONSEND_API_KEY", raising=False)
    with pytest.raises(MissingApiKeyError):
        millionsend.Emails.get("e1")


def test_api_key_from_env(monkeypatch):
    monkeypatch.setattr(millionsend, "api_key", None)
    monkeypatch.setenv("MILLIONSEND_API_KEY", "ms_env")

    calls = []

    def fake(method, url, headers=None, **kw):
        calls.append(headers["Authorization"])

        class R:
            status_code = 200
            text = "{}"

        return R()

    monkeypatch.setattr(millionsend, "base_url", "https://api.test")
    monkeypatch.setattr(_client.requests, "request", fake)
    millionsend.Emails.get("e1")
    assert calls[0] == "Bearer ms_env"


def test_base_url_default_and_trailing_slash(monkeypatch):
    monkeypatch.setattr(millionsend, "api_key", "ms_test")
    monkeypatch.setattr(millionsend, "base_url", "https://api.test/")
    seen = {}

    def fake(method, url, headers=None, **kw):
        seen["url"] = url

        class R:
            status_code = 200
            text = "{}"

        return R()

    monkeypatch.setattr(_client.requests, "request", fake)
    millionsend.Emails.get("e1")
    assert seen["url"] == "https://api.test/emails/e1"


def test_base_url_defaults_to_cloud_then_env_then_option(http, monkeypatch):
    monkeypatch.setattr(millionsend, "base_url", None)
    monkeypatch.delenv("MILLIONSEND_BASE_URL", raising=False)
    millionsend.Emails.get("e1")
    assert http.calls[0]["url"] == "https://api.millionsend.com/emails/e1"

    monkeypatch.setenv("MILLIONSEND_BASE_URL", "https://mail.example.com")
    millionsend.Emails.get("e1")
    assert http.calls[1]["url"] == "https://mail.example.com/emails/e1"

    monkeypatch.setattr(millionsend, "base_url", "https://api.test")
    millionsend.Emails.get("e1")
    assert http.calls[2]["url"] == "https://api.test/emails/e1"


def test_refuses_non_loopback_http_unless_allowed(http, monkeypatch):
    monkeypatch.setattr(millionsend, "allow_insecure_http", False)
    for base in ("http://mail.example.com", "http://mail.example.com/"):
        monkeypatch.setattr(millionsend, "base_url", base)
        with pytest.raises(MillionSendError, match="allow_insecure_http"):
            millionsend.Emails.get("e1")
    assert http.calls == []

    monkeypatch.setattr(millionsend, "base_url", None)
    monkeypatch.setenv("MILLIONSEND_BASE_URL", "http://mail.example.com")
    with pytest.raises(MillionSendError, match="allow_insecure_http"):
        millionsend.Emails.get("e1")

    monkeypatch.setattr(millionsend, "allow_insecure_http", True)
    millionsend.Emails.get("e1")
    assert http.calls[-1]["url"] == "http://mail.example.com/emails/e1"

    monkeypatch.setattr(millionsend, "allow_insecure_http", False)
    for base in ("http://localhost:3001", "http://127.0.0.1:3001"):
        monkeypatch.setattr(millionsend, "base_url", base)
        millionsend.Emails.get("e1")


def test_auth_accept_user_agent_and_content_type(http):
    millionsend.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "html": "<p>h</p>"})
    h = http.calls[0]["headers"]
    assert h["Authorization"] == "Bearer ms_test"
    assert h["Accept"] == "application/json"
    assert h["Content-Type"] == "application/json"
    assert h["User-Agent"].startswith("millionsend-python/")


def test_no_content_type_on_get(http):
    millionsend.Emails.get("e1")
    assert "Content-Type" not in http.calls[0]["headers"]


def test_idempotency_key_on_post_only(http):
    millionsend.Emails.send(
        {"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"},
        idempotency_key="key-123",
    )
    assert http.calls[0]["headers"]["Idempotency-Key"] == "key-123"


def test_returns_wrapped_dict_with_attribute_access(http):
    http.body = {"id": "abc", "data": [{"id": "1"}]}
    res = millionsend.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"})
    assert res["id"] == "abc"
    assert res.id == "abc"
    assert res.data[0].id == "1"


def test_error_parsed_into_typed_exception(http):
    http.status = 422
    http.body = {"statusCode": 422, "name": "validation_error", "message": "bad"}
    with pytest.raises(ValidationError) as ei:
        millionsend.Emails.send({"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"})
    assert ei.value.code == "validation_error"
    assert ei.value.message == "bad"
    assert ei.value.status_code == 422
    assert isinstance(ei.value, MillionSendError)


def test_not_found_maps_to_subclass(http):
    http.status = 404
    http.body = {"statusCode": 404, "name": "not_found", "message": "nope"}
    with pytest.raises(NotFoundError):
        millionsend.Emails.get("missing")


def test_non_canonical_body_falls_back(http):
    http.status = 500
    http.body = "gateway boom"
    with pytest.raises(MillionSendError) as ei:
        millionsend.Emails.get("e1")
    assert ei.value.code == "application_error"
    assert ei.value.status_code == 500
    assert ei.value.message == "Request failed with status 500"


def test_transport_failure_has_status_code_none(http):
    http.exc = requests.exceptions.ConnectionError("ECONNREFUSED")
    with pytest.raises(MillionSendError) as ei:
        millionsend.Emails.get("e1")
    assert ei.value.status_code is None
    assert "ECONNREFUSED" in ei.value.message
    # transport failures are the base error, never a typed API subclass
    assert type(ei.value) is MillionSendError


def test_options_dict_resend_shape_and_positional_string(http):
    params = {"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"}
    millionsend.Emails.send(params, {"idempotency_key": "dict-key"})
    assert http.calls[0]["headers"]["Idempotency-Key"] == "dict-key"

    millionsend.Emails.send(params, "positional-key")
    assert http.calls[1]["headers"]["Idempotency-Key"] == "positional-key"

    millionsend.Emails.send(params, {"idempotency_key": "dict-key"}, idempotency_key="kw-key")
    assert http.calls[2]["headers"]["Idempotency-Key"] == "kw-key"

    millionsend.Emails.send(params)
    assert "Idempotency-Key" not in http.calls[3]["headers"]
    assert "x-batch-validation" not in http.calls[3]["headers"]


def test_batch_validation_header_post_only(http):
    items = [{"from": "a@x.dev", "to": "b@x.dev", "subject": "s", "text": "t"}]
    millionsend.Batch.send(items, batch_validation="permissive")
    assert http.calls[0]["headers"]["x-batch-validation"] == "permissive"
    assert "Idempotency-Key" not in http.calls[0]["headers"]

    millionsend.Batch.send(items, {"batch_validation": "strict", "idempotency_key": "b-1"})
    assert http.calls[1]["headers"]["x-batch-validation"] == "strict"
    assert http.calls[1]["headers"]["Idempotency-Key"] == "b-1"

    millionsend.Batch.send(items)
    assert "x-batch-validation" not in http.calls[2]["headers"]

    _client.request("GET", "/emails", idempotency_key="k", batch_validation="permissive")
    assert "x-batch-validation" not in http.calls[3]["headers"]
    assert "Idempotency-Key" not in http.calls[3]["headers"]


def test_list_accepts_resend_params_dict(http):
    millionsend.Domains.list({"limit": 5, "after": "cur"})
    assert http.calls[0]["params"] == {"limit": 5, "after": "cur"}

    millionsend.Suppressions.list({"origin": "bounce", "before": None})
    assert http.calls[1]["params"] == {"origin": "bounce"}

    millionsend.Domains.list({})
    assert http.calls[2]["params"] is None


def test_every_api_error_name_maps_to_a_subclass(http):
    cases = {
        "missing_api_key": (401, millionsend.MissingApiKeyError),
        "invalid_api_key": (401, millionsend.InvalidApiKeyError),
        "restricted_api_key": (403, millionsend.RestrictedApiKeyError),
        "forbidden": (403, millionsend.ForbiddenError),
        "invalid_parameter": (400, millionsend.InvalidParameterError),
        "invalid_payload": (400, millionsend.InvalidPayloadError),
        "all_recipients_suppressed": (422, millionsend.AllRecipientsSuppressedError),
        "payload_too_large": (413, millionsend.PayloadTooLargeError),
        "conflict": (409, millionsend.ConflictError),
        "concurrent_idempotent_requests": (409, millionsend.ConcurrentIdempotentRequestsError),
        "invalid_idempotent_request": (409, millionsend.InvalidIdempotentRequestError),
        "rate_limit_exceeded": (429, millionsend.RateLimitExceededError),
        "daily_quota_exceeded": (429, millionsend.DailyQuotaExceededError),
        "plan_limit_reached": (402, millionsend.PlanLimitReachedError),
        "sending_paused": (403, millionsend.SendingPausedError),
        "internal_server_error": (500, millionsend.InternalServerError),
        "application_error": (500, millionsend.ApplicationError),
    }
    for name, (status, cls) in cases.items():
        http.status = status
        http.body = {"statusCode": status, "name": name, "message": name}
        with pytest.raises(cls) as ei:
            millionsend.Emails.get("e1")
        assert ei.value.code == name
        assert ei.value.status_code == status
        assert isinstance(ei.value, MillionSendError)
