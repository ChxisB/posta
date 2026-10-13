<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/**
 * Segments — same methods as resend-php's, but membership is dynamic: a
 * segment is a saved `filter` over the team's contacts (the filter itself is
 * the MillionSend extension). `get` returns a live `contact_count`.
 */
final class Segments
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * @param array{name: string, filter?: array<string,mixed>|null} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/segments', Util::body($params));
    }

    /** @return array<mixed> */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/segments/' . rawurlencode($id));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/segments', null, Util::listQuery($options));
    }

    /**
     * @param array{name?: string, filter?: array<string,mixed>|null} $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/segments/' . rawurlencode($id), Util::body($params));
    }

    /** @return array<mixed> */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/segments/' . rawurlencode($id));
    }
}
