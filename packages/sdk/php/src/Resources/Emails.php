<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

final class Emails
{
    /**
     * Send-payload camelCase aliases => wire snake_case. Every other key
     * (tags, attachments, headers, template, …) passes through untouched, so a
     * verbatim resend-php payload works. Shared with {@see Batch}.
     */
    public const WIRE_MAP = [
        'replyTo' => 'reply_to',
        'scheduledAt' => 'scheduled_at',
        'topicId' => 'topic_id',
    ];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /emails. Options: `idempotencyKey` (or resend-php's `idempotency_key`).
     *
     * @param array<string,mixed> $params
     * @param array{idempotencyKey?: string, idempotency_key?: string} $options
     * @return array<mixed>
     */
    public function send(array $params, array $options = []): array
    {
        return $this->http->request(
            'POST',
            '/emails',
            Util::body($params, self::WIRE_MAP),
            [],
            null,
            Util::optionHeaders($options),
        );
    }

    /**
     * Alias of {@see send()}, mirroring Resend.
     *
     * @param array<string,mixed> $params
     * @param array{idempotencyKey?: string, idempotency_key?: string} $options
     * @return array<mixed>
     */
    public function create(array $params, array $options = []): array
    {
        return $this->send($params, $options);
    }

    /** @return array<mixed> */
    public function get(string $id): array
    {
        return $this->http->request('GET', '/emails/' . rawurlencode($id));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/emails', null, Util::listQuery($options));
    }

    /**
     * PATCH /emails/:id — reschedule a scheduled, unsent email.
     *
     * @param array{scheduledAt?: string, scheduled_at?: string} $params
     * @return array<mixed>
     */
    public function update(string $id, array $params): array
    {
        return $this->http->request('PATCH', '/emails/' . rawurlencode($id), Util::body($params, self::WIRE_MAP));
    }

    /**
     * GET /emails/:id/insights — the pre-send best-practice report. 404 when
     * the email is unknown or has no insights yet.
     *
     * @return array<mixed>
     */
    public function getInsights(string $id): array
    {
        return $this->http->request('GET', '/emails/' . rawurlencode($id) . '/insights');
    }

    /**
     * POST /emails/:id/cancel — only scheduled, unsent emails.
     *
     * @return array<mixed>
     */
    public function cancel(string $id): array
    {
        return $this->http->request('POST', '/emails/' . rawurlencode($id) . '/cancel');
    }

    /**
     * DELETE /emails/:id (MillionSend extension).
     *
     * @return array<mixed>
     */
    public function remove(string $id): array
    {
        return $this->http->request('DELETE', '/emails/' . rawurlencode($id));
    }
}
