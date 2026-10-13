<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Subscription topics — granular unsubscribe categories for a team. */
final class Topics
{
    private const WIRE_MAP = ['defaultSubscription' => 'default_subscription'];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * @param array{name: string, defaultSubscription: string, description?: string, visibility?: string} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/topics', Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/topics/' . rawurlencode($id));
    }

    /**
     * GET /topics — a bare `{ data }` list (topics are unpaginated).
     *
     * @return array<mixed>
     */
    public function list(): array
    {
        return $this->http->request('GET', '/topics');
    }

    /**
     * @param array{name?: string, description?: string, visibility?: string} $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/topics/' . rawurlencode($id), Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/topics/' . rawurlencode($id));
    }
}
