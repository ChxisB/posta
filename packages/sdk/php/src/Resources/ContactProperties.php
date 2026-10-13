<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Custom contact property definitions (typed `string` or `number`). */
final class ContactProperties
{
    private const WIRE_MAP = ['fallbackValue' => 'fallback_value'];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /contact-properties.
     *
     * @param array{key: string, type: string, fallbackValue?: string|float|int|null} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/contact-properties', Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/contact-properties/' . rawurlencode($id));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/contact-properties', null, Util::listQuery($options));
    }

    /**
     * PATCH /contact-properties/:id — only `fallbackValue` is mutable (null clears it).
     *
     * @param array{fallbackValue?: string|float|int|null} $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/contact-properties/' . rawurlencode($id), Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/contact-properties/' . rawurlencode($id));
    }
}
