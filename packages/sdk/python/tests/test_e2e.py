"""End-to-end smoke test against a real Posta instance.

Opt-in: runs only when POSTA_API_KEY is set (and POSTA_BASE_URL when
the target is not Posta Cloud). It exercises the contact lifecycle, which needs no
verified domain. Sending is not asserted because it needs a verified sender
domain.

    POSTA_API_KEY=po_... POSTA_BASE_URL=http://localhost:3001 \
        pytest -k e2e
"""

import os
import time

import pytest

import posta
from posta import NotFoundError

pytestmark = pytest.mark.skipif(
    not os.environ.get("POSTA_API_KEY"),
    reason="set POSTA_API_KEY to run the e2e lifecycle test",
)


def test_contact_lifecycle():
    stamp = int(time.time() * 1000)
    email = f"sdk-e2e-{stamp}@example.com"
    created = posta.Contacts.create({"email": email, "first_name": "Ada"})
    assert created.id
    try:
        fetched = posta.Contacts.get(email=email)
        assert fetched.email == email
        assert fetched.first_name == "Ada"

        posta.Contacts.update({"email": email, "unsubscribed": True})
    finally:
        removed = posta.Contacts.remove(email=email)
        assert removed.deleted is True


def test_not_found_raises():
    with pytest.raises(NotFoundError):
        posta.Contacts.get(email="does-not-exist@example.com")
