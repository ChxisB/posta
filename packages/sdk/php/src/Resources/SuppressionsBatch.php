<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Up to 1000 suppressions per call. */
final class SuppressionsBatch
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /suppressions/batch/add.
     *
     * @param array{emails: list<string>, origin?: string} $params
     * @return array<mixed>
     */
    public function add(array $params): array
    {
        return $this->http->request('POST', '/suppressions/batch/add', Util::body($params));
    }

    /**
     * POST /suppressions/batch/remove — by `emails` or by `ids`.
     *
     * @param array{emails?: list<string>, ids?: list<string>} $params
     * @return array<mixed>
     */
    public function remove(array $params): array
    {
        return $this->http->request('POST', '/suppressions/batch/remove', Util::body($params));
    }
}
