"""Official Python SDK for MillionSend — a self-hostable, Resend-compatible email API.

Configure once at the module level, then call resource classes::

    import millionsend

    millionsend.api_key = "ms_123"
    millionsend.base_url = "https://mail.acme.dev"  # self-hosted only; Cloud needs just the key

    email = millionsend.Emails.send({
        "from": "Acme <onboarding@acme.dev>",
        "to": "success@simulator.amazonses.com",
        "subject": "Hello",
        "html": "<strong>it works</strong>",
    })
    print(email.id)

``api_key`` / ``base_url`` also read from ``MILLIONSEND_API_KEY`` /
``MILLIONSEND_BASE_URL``. Errors raise :class:`MillionSendError` subclasses.
"""

import os
from typing import Optional

from ._client import VERSION as __version__
from ._client import Response
from .api_keys import ApiKeys
from .broadcasts import Broadcasts
from .contact_properties import ContactProperties
from .contacts import Contacts
from .deliverability import Deliverability
from .domains import Domains
from .emails import Batch, Emails
from .errors import (
    AllRecipientsSuppressedError,
    ApplicationError,
    ConcurrentIdempotentRequestsError,
    ConflictError,
    DailyQuotaExceededError,
    ForbiddenError,
    InternalServerError,
    InvalidApiKeyError,
    InvalidIdempotentRequestError,
    InvalidParameterError,
    InvalidPayloadError,
    MillionSendError,
    MissingApiKeyError,
    NotFoundError,
    PayloadTooLargeError,
    PlanLimitReachedError,
    RateLimitExceededError,
    RestrictedApiKeyError,
    SendingPausedError,
    ValidationError,
)
from .segments import Segments
from .suppressions import Suppressions
from .templates import Templates
from .topics import Topics
from .usage import Usage
from .webhooks import Webhooks

# Module-level config (resend-python style). Env vars seed the defaults; either
# these globals or the env vars are read at call time.
api_key: Optional[str] = os.environ.get("MILLIONSEND_API_KEY")
base_url: Optional[str] = os.environ.get("MILLIONSEND_BASE_URL")
timeout: Optional[float] = None
# Plain http is only accepted for loopback hosts unless this is set.
allow_insecure_http: bool = False

__all__ = [
    "api_key",
    "base_url",
    "timeout",
    "allow_insecure_http",
    "Emails",
    "Batch",
    "Contacts",
    "ContactProperties",
    "Topics",
    "Broadcasts",
    "Segments",
    "Suppressions",
    "Domains",
    "Webhooks",
    "ApiKeys",
    "Templates",
    "Usage",
    "Deliverability",
    "Response",
    "MillionSendError",
    "MissingApiKeyError",
    "InvalidApiKeyError",
    "ValidationError",
    "AllRecipientsSuppressedError",
    "InvalidParameterError",
    "InvalidPayloadError",
    "PayloadTooLargeError",
    "NotFoundError",
    "ConflictError",
    "ForbiddenError",
    "RestrictedApiKeyError",
    "SendingPausedError",
    "RateLimitExceededError",
    "DailyQuotaExceededError",
    "PlanLimitReachedError",
    "InvalidIdempotentRequestError",
    "ConcurrentIdempotentRequestsError",
    "InternalServerError",
    "ApplicationError",
    "__version__",
]
