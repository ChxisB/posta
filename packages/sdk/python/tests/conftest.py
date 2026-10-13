"""Shared test fixtures: a fake `requests.request` that records every call."""

import json

import pytest

import millionsend
from millionsend import _client


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        if body is None:
            self.text = ""
        elif isinstance(body, str):
            self.text = body
        else:
            self.text = json.dumps(body)


class Recorder:
    """Records calls and returns a canned response; set .status/.body per test."""

    def __init__(self):
        self.calls = []
        self.status = 200
        self.body = {"id": "id_1"}
        self.exc = None

    def __call__(self, method, url, headers=None, data=None, params=None, timeout=None):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "path": url.replace("https://api.test", ""),
                "headers": headers or {},
                "params": params,
                "body": json.loads(data) if data else None,
            }
        )
        if self.exc is not None:
            raise self.exc
        return FakeResponse(self.status, self.body)


@pytest.fixture
def http(monkeypatch):
    monkeypatch.setattr(millionsend, "api_key", "ms_test")
    monkeypatch.setattr(millionsend, "base_url", "https://api.test")
    monkeypatch.setattr(millionsend, "timeout", None)
    rec = Recorder()
    monkeypatch.setattr(_client.requests, "request", rec)
    return rec
