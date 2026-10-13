<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;

/**
 * Account-level deliverability score over the trailing window (MillionSend
 * extension, no Resend equivalent). Scores are 0-10; null means not enough
 * data to compute.
 */
final class Deliverability
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * GET /deliverability
     *
     * @return array<mixed>
     */
    public function get(): array
    {
        return $this->http->request('GET', '/deliverability');
    }
}
