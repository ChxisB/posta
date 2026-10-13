<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** API keys. The `token` is returned once, by `create`, and never again. */
final class ApiKeys
{
    private const WIRE_MAP = ['domainId' => 'domain_id'];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /api-keys — `permission` is full_access (default) or sending_access;
     * `domainId` restricts a sending key to one domain.
     *
     * @param array{name: string, permission?: string, domainId?: string|null} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/api-keys', Util::body($params, self::WIRE_MAP));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/api-keys', null, Util::listQuery($options));
    }

    /** @return array<mixed> */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/api-keys/' . rawurlencode($id));
    }
}
