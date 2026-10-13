<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;

/** Membership of a contact in dynamic segments; the contact is addressed by id or email. */
final class ContactSegments
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /contacts/:idOrEmail/segments/:segmentId
     *
     * @return array<mixed>
     */
    public function add(string $contact, string $segmentId): array
    {
        return $this->http->request('POST', self::path($contact, $segmentId));
    }

    /**
     * DELETE /contacts/:idOrEmail/segments/:segmentId
     *
     * @return array<mixed>
     */
    public function remove(string $contact, string $segmentId): array
    {
        return $this->http->request('DELETE', self::path($contact, $segmentId));
    }

    private static function path(string $contact, string $segmentId): string
    {
        return '/contacts/' . rawurlencode($contact) . '/segments/' . rawurlencode($segmentId);
    }
}
