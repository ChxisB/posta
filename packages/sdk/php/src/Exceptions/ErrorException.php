<?php

declare(strict_types=1);

namespace MillionSend\Exceptions;

/**
 * Thrown on every non-2xx MillionSend response, plus the two client-side
 * conditions (a request that never left the process, a transport failure) which
 * carry a null status code. Mirrors Resend's `ErrorException`, so `catch`
 * blocks that switch on {@see getErrorName()} port across unchanged.
 */
final class ErrorException extends \Exception
{
    public function __construct(
        private readonly string $errorName,
        string $errorMessage,
        private readonly ?int $statusCode,
    ) {
        parent::__construct($errorMessage);
    }

    /** Stable snake_case code — the discriminant, e.g. "validation_error", "not_found". */
    public function getErrorName(): string
    {
        return $this->errorName;
    }

    public function getErrorMessage(): string
    {
        return $this->getMessage();
    }

    /** HTTP status; null when the request never reached the API. */
    public function getStatusCode(): ?int
    {
        return $this->statusCode;
    }

    /** Coerce an arbitrary decoded error body into the canonical shape. */
    public static function fromBody(mixed $body, int $status): self
    {
        if (is_array($body)) {
            $name = is_string($body['name'] ?? null) ? $body['name'] : 'application_error';
            $message = is_string($body['message'] ?? null)
                ? $body['message']
                : "Request failed with status {$status}";
            $statusCode = is_int($body['statusCode'] ?? null) ? $body['statusCode'] : $status;

            return new self($name, $message, $statusCode);
        }

        return new self('application_error', "Request failed with status {$status}", $status);
    }
}
