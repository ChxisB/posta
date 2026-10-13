<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;

/** Plan, limits and today's send count (MillionSend extension, no Resend equivalent). */
final class Usage
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * GET /usage
     *
     * @return array<mixed>
     */
    public function get(): array
    {
        return $this->http->request('GET', '/usage');
    }
}
