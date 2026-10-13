<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;

/** Per-contact topic subscriptions (opt in/out of a topic). */
final class ContactTopics
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * GET /contacts/:idOrEmail/topics — every topic with the contact's effective
     * `subscription` (opt_in|opt_out); `explicit` is false when that is just the
     * topic default; `visibility` (public|private) says whether the hosted
     * preference page lists it. resend-php's name; {@see list()} is an alias.
     *
     * @return array<mixed>
     */
    public function get(string $contact): array
    {
        return $this->http->request('GET', self::path($contact));
    }

    /** @return array<mixed> */
    public function list(string $contact): array
    {
        return $this->get($contact);
    }

    /**
     * PATCH /contacts/:idOrEmail/topics — body is the bare subscription array.
     * Two shapes: resend-php's `update($idOrEmail, $topics)` where `$topics` is
     * the list itself (or `['topics' => $list]`), or a single array carrying the
     * address (`email` wins over `id`) alongside `topics`.
     *
     * @param string|array{id?: string, email?: string, topics: list<array{id: string, subscription: string}>} $contact
     * @param list<array{id: string, subscription: string}>|array{topics: list<array{id: string, subscription: string}>} $topics
     * @return array<mixed>
     */
    public function update(string|array $contact, array $topics = []): array
    {
        if (is_array($contact)) {
            $topics = $contact['topics'] ?? [];
            $contact = (string) ($contact['email'] ?? $contact['id'] ?? '');
        }
        $list = $topics['topics'] ?? $topics;

        return $this->http->request('PATCH', self::path($contact), array_values($list));
    }

    private static function path(string $contact): string
    {
        return '/contacts/' . rawurlencode($contact) . '/topics';
    }
}
