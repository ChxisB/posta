<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** The team's suppression list — addresses that are never sent to. Addressable by id or email. */
final class Suppressions
{
    public readonly SuppressionsBatch $batch;

    public function __construct(private readonly HttpClient $http)
    {
        $this->batch = new SuppressionsBatch($http);
    }

    /**
     * POST /suppressions.
     *
     * @param array{email: string, origin?: string} $params
     * @return array<mixed>
     */
    public function add(array $params): array
    {
        return $this->http->request('POST', '/suppressions', Util::body($params));
    }

    /**
     * Alias of {@see add()}.
     *
     * @param array{email: string, origin?: string} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->add($params);
    }

    /** @return array<mixed> */
    public function get(string $idOrEmail): array
    {
        return $this->http->request('GET', '/suppressions/' . rawurlencode($idOrEmail));
    }

    /**
     * GET /suppressions — `origin` filters to bounce|complaint|manual|unsubscribe.
     *
     * @param array{limit?: int, after?: string, before?: string, origin?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/suppressions', null, Util::listQuery($options, ['origin']));
    }

    /** @return array<mixed> */
    public function remove(string $idOrEmail): array
    {
        return $this->http->request('DELETE', '/suppressions/' . rawurlencode($idOrEmail));
    }
}
