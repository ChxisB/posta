"""Exception hierarchy for the MillionSend SDK.

On any non-2xx response the API returns ``{"statusCode", "name", "message"}``.
``name`` is the stable discriminant; each known name maps to a subclass so
callers can ``except NotFoundError``. Client-side/transport failures that never
reached the API raise the base error with ``status_code=None``.
"""

from typing import Optional


class MillionSendError(Exception):
    """Base for every SDK error.

    Attributes:
        code: the API's stable ``name`` discriminant (e.g. ``"validation_error"``),
            or ``None`` for a client-side failure.
        message: human-readable message.
        status_code: HTTP status, or ``None`` when the request never reached the API.
    """

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class MissingApiKeyError(MillionSendError):
    """No API key was configured (option or MILLIONSEND_API_KEY), or the request carried none."""


class InvalidApiKeyError(MillionSendError):
    pass


class ValidationError(MillionSendError):
    pass


class AllRecipientsSuppressedError(MillionSendError):
    """422 on send: every ``to`` recipient is suppressed or opted out of the send's ``topic_id``."""


class InvalidParameterError(MillionSendError):
    pass


class InvalidPayloadError(MillionSendError):
    pass


class PayloadTooLargeError(MillionSendError):
    pass


class NotFoundError(MillionSendError):
    pass


class ConflictError(MillionSendError):
    pass


class ForbiddenError(MillionSendError):
    pass


class RestrictedApiKeyError(MillionSendError):
    pass


class SendingPausedError(MillionSendError):
    pass


class RateLimitExceededError(MillionSendError):
    pass


class DailyQuotaExceededError(MillionSendError):
    pass


class PlanLimitReachedError(MillionSendError):
    pass


class InvalidIdempotentRequestError(MillionSendError):
    pass


class ConcurrentIdempotentRequestsError(MillionSendError):
    pass


class InternalServerError(MillionSendError):
    pass


class ApplicationError(MillionSendError):
    pass


# name discriminant -> exception class; unknown names fall back to the base.
ERROR_TYPES = {
    "missing_api_key": MissingApiKeyError,
    "invalid_api_key": InvalidApiKeyError,
    "validation_error": ValidationError,
    "all_recipients_suppressed": AllRecipientsSuppressedError,
    "invalid_parameter": InvalidParameterError,
    "invalid_payload": InvalidPayloadError,
    "payload_too_large": PayloadTooLargeError,
    "not_found": NotFoundError,
    "conflict": ConflictError,
    "forbidden": ForbiddenError,
    "restricted_api_key": RestrictedApiKeyError,
    "sending_paused": SendingPausedError,
    "rate_limit_exceeded": RateLimitExceededError,
    "daily_quota_exceeded": DailyQuotaExceededError,
    "plan_limit_reached": PlanLimitReachedError,
    "invalid_idempotent_request": InvalidIdempotentRequestError,
    "concurrent_idempotent_requests": ConcurrentIdempotentRequestsError,
    "internal_server_error": InternalServerError,
    "application_error": ApplicationError,
}


def raise_api_error(status: int, parsed: object) -> None:
    """Coerce a parsed non-2xx body into the canonical error and raise it."""
    if isinstance(parsed, dict):
        name = parsed.get("name")
        name = name if isinstance(name, str) else "application_error"
        message = parsed.get("message")
        message = message if isinstance(message, str) else f"Request failed with status {status}"
        status_code = parsed.get("statusCode")
        status_code = status_code if isinstance(status_code, int) else status
    else:
        name = "application_error"
        message = f"Request failed with status {status}"
        status_code = status
    raise ERROR_TYPES.get(name, MillionSendError)(message, code=name, status_code=status_code)
