<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Webhook endpoints. `get` and `rotate` are the only calls that return the `signing_secret`. */
final class Webhooks
{
    private const WIRE_MAP = ['signingSecret' => 'signing_secret', 'overlapHours' => 'overlap_hours'];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /webhooks — omit `signingSecret` to have one generated.
     *
     * @param array{endpoint: string, events: list<string>, signingSecret?: string} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/webhooks', Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> Includes `previous_secret_expires_at` (null when no rotation overlap window is open). */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/webhooks/' . rawurlencode($id));
    }

    /**
     * POST /webhooks/:id/rotate — mints a new secret (or takes `signingSecret`).
     * For `overlapHours` (0..72) deliveries carry both the new and the previous
     * signature, so the receiver can switch without a gap.
     *
     * @param array{signingSecret?: string, overlapHours?: int} $params
     * @return array<mixed>
     */
    public function rotate(string $id, array $params = []): array
    {
        return $this->http->request('POST', '/webhooks/' . rawurlencode($id) . '/rotate', Util::body($params, self::WIRE_MAP));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/webhooks', null, Util::listQuery($options));
    }

    /**
     * @param array{endpoint?: string, events?: list<string>, status?: string} $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/webhooks/' . rawurlencode($id), Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/webhooks/' . rawurlencode($id));
    }
}
