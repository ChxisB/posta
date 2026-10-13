<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Reusable email templates, addressable by id or alias. */
final class Templates
{
    private const WIRE_MAP = ['replyTo' => 'reply_to'];

    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /templates.
     *
     * @param array{name: string, html: string, subject?: string|null, text?: string|null, alias?: string|null, from?: string|null, replyTo?: string|list<string>|null, variables?: list<mixed>} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/templates', Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function get(string $idOrAlias): array
    {
        return $this->http->request('GET', '/templates/' . rawurlencode($idOrAlias));
    }

    /**
     * @param array{limit?: int, after?: string, before?: string} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        return $this->http->request('GET', '/templates', null, Util::listQuery($options));
    }

    /**
     * PATCH /templates/:idOrAlias — `alias`, `subject` and `text` accept null to clear.
     *
     * @param array<string,mixed> $params
     * @return array<mixed>
     */
    public function update(string $idOrAlias, array $params): array
    {
        return $this->http->request('PATCH', '/templates/' . rawurlencode($idOrAlias), Util::body($params, self::WIRE_MAP));
    }

    /** @return array<mixed> */
    public function remove(string $idOrAlias): array
    {
        return $this->http->request('DELETE', '/templates/' . rawurlencode($idOrAlias));
    }

    /**
     * POST /templates/:idOrAlias/publish — templates are always published on
     * MillionSend; kept for resend-php compatibility.
     *
     * @return array<mixed>
     */
    public function publish(string $idOrAlias): array
    {
        return $this->http->request('POST', '/templates/' . rawurlencode($idOrAlias) . '/publish');
    }

    /**
     * POST /templates/:idOrAlias/duplicate
     *
     * @return array<mixed>
     */
    public function duplicate(string $idOrAlias): array
    {
        return $this->http->request('POST', '/templates/' . rawurlencode($idOrAlias) . '/duplicate');
    }
}
