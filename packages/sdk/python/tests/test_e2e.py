"""End-to-end smoke test against a real MillionSend instance.

Opt-in: runs only when MILLIONSEND_API_KEY is set (and MILLIONSEND_BASE_URL when
the target is not MillionSend Cloud). It exercises the contact lifecycle, which needs no
verified domain. Sending is not asserted because it needs a verified sender
domain.

    MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 \
        pytest -k e2e
"""

import os
import time

import pytest

import millionsend
from millionsend import NotFoundError

pytestmark = pytest.mark.skipif(
    not os.environ.get("MILLIONSEND_API_KEY"),
    reason="set MILLIONSEND_API_KEY to run the e2e lifecycle test",
)


def test_contact_lifecycle():
    stamp = int(time.time() * 1000)
    email = f"sdk-e2e-{stamp}@example.com"
    created = millionsend.Contacts.create({"email": email, "first_name": "Ada"})
    assert created.id
    try:
        fetched = millionsend.Contacts.get(email=email)
        assert fetched.email == email
        assert fetched.first_name == "Ada"

        millionsend.Contacts.update({"email": email, "unsubscribed": True})
    finally:
        removed = millionsend.Contacts.remove(email=email)
        assert removed.deleted is True


def test_not_found_raises():
    with pytest.raises(NotFoundError):
        millionsend.Contacts.get(email="does-not-exist@example.com")
