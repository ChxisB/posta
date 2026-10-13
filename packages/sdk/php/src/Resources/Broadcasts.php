<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

final class Broadcasts
{
    private const WIRE_MAP = [
        'segmentId' => 'segment_id',
        'replyTo' => 'reply_to',
        'previewText' => 'preview_text',
        'topicId' => 'topic_id',
        'scheduledAt' => 'scheduled_at',
    ];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /broadcasts. Pass `send => true` (optionally with `scheduledAt`) to
     * create and send in one call.
     *
     * @param array<string,mixed> $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/broadcasts', Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/broadcasts/' . rawurlencode($id));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/broadcasts', null, Util::listQuery($options));
    }

    /**
     * PATCH — draft only. `topicId => null` / `segmentId => null` clear the target.
     *
     * @param array<string,mixed> $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/broadcasts/' . rawurlencode($id), Util::body($params, self::WIRE_MAP));
    }

    /**
     * DELETE — draft only.
     *
     * @return array<mixed>
     */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/broadcasts/' . rawurlencode($id));
    }

    /**
     * POST /broadcasts/:id/send — omit `scheduledAt` to send now.
     *
     * @param array{scheduledAt?: string, scheduled_at?: string} $options
     * @return array<mixed>
     */
    public function send(string $id, array $options = []): array
    {
        return $this->http->request('POST', '/broadcasts/' . rawurlencode($id) . '/send', Util::body($options, self::WIRE_MAP));
    }

    /**
     * POST /broadcasts/:id/cancel — scheduled only.
     *
     * @return array<mixed>
     */
    public function cancel(string $id): array
    {
        return $this->http->request('POST', '/broadcasts/' . rawurlencode($id) . '/cancel');
    }
}
