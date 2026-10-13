<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/**
 * Contacts — team-global (one record per email, case-insensitive), addressable
 * by id OR email (email wins when both are present).
 */
final class Contacts
{
    public readonly ContactTopics $topics;
    public readonly ContactSegments $segments;
    public readonly ContactsBatch $batch;

    /** camelCase aliases => wire names; every other key passes through. Shared with {@see ContactsBatch}. */
    public const WIRE_MAP = [
        'firstName' => 'first_name',
        'lastName' => 'last_name',
    ];

    public function __construct(private readonly HttpClient $http)
    {
        $this->topics = new ContactTopics($http);
        $this->segments = new ContactSegments($http);
        $this->batch = new ContactsBatch($http);
    }

    /**
     * POST /contacts — 409 validation_error when the email already exists on the team.
     *
     * @param array{email: string, firstName?: string, lastName?: string, unsubscribed?: bool, properties?: array<string,mixed>, segments?: list<array{id: string}>, topics?: list<array{id: string, subscription: string}>} $params
     * @return array<mixed>
     */
    public function create(array $params): array
    {
        return $this->http->request('POST', '/contacts', Util::body($params, self::WIRE_MAP));
    }

    /**
     * @param string|array<string,mixed> $contact
     * @return array<mixed>
     */
    public function get(string|array $contact): array
    {
        return $this->http->request('GET', self::path(self::normalize($contact)));
    }

    /**
     * PATCH — a null value clears a field; omit a key to leave it unchanged.
     * Two shapes: resend-php's `update($idOrEmail, $params)`, or a single array
     * carrying the address (`id`/`email`) alongside the fields to change.
     *
     * @param string|array<string,mixed> $contact
     * @param array{firstName?: string|null, lastName?: string|null, unsubscribed?: bool, properties?: array<string,mixed>} $params
     * @return array<mixed>
     */
    public function update(string|array $contact, array $params = []): array
    {
        $addr = self::normalize($contact);
        $fields = $params === [] ? array_diff_key($addr, ['id' => true, 'email' => true]) : $params;

        return $this->http->request('PATCH', self::path($addr), Util::body($fields, self::WIRE_MAP));
    }

    /**
     * DELETE /contacts/:idOrEmail. The contact's emails stay in the send log;
     * `erase => true` (`?erase=true`) also scrubs the address from email history,
     * event payloads and API logs (a GDPR/LGPD erasure).
     *
     * @param string|array<string,mixed> $contact
     * @param array{erase?: bool} $options
     * @return array<mixed>
     */
    public function remove(string|array $contact, array $options = []): array
    {
        // The API reads the literal `true`; http_build_query would render a bool as `1`.
        $query = empty($options['erase']) ? [] : ['erase' => 'true'];

        return $this->http->request('DELETE', self::path(self::normalize($contact)), null, $query);
    }

    /**
     * GET /contacts, or GET /segments/:id/contacts when `segmentId`/`segment_id` is given.
     * `include` (`properties` and/or `topics`) attaches the property map and the
     * topic subscriptions to every item (`?include=properties,topics`).
     *
     * @param array{limit?: int, after?: string, before?: string, segmentId?: string, segment_id?: string, include?: list<string>} $options
     * @return array<mixed>
     */
    public function list(array $options = []): array
    {
        $segment = $options['segmentId'] ?? $options['segment_id'] ?? null;
        $path = $segment === null ? '/contacts' : '/segments/' . rawurlencode((string) $segment) . '/contacts';
        $query = Util::listQuery($options);
        if (isset($options['include'])) {
            $query['include'] = implode(',', (array) $options['include']);
        }

        return $this->http->request('GET', $path, null, $query);
    }

    /**
     * POST /contacts/:idOrEmail/preferences-link — the contact's hosted
     * preference page (public topics + global unsubscribe). The URL never
     * expires and lets its holder change that contact's preferences, so show it
     * only to the contact. 422 when the instance cannot build hosted links.
     *
     * @param string|array<string,mixed> $contact
     * @return array<mixed>
     */
    public function preferencesLink(string|array $contact): array
    {
        return $this->http->request('POST', self::path(self::normalize($contact)) . '/preferences-link');
    }

    /**
     * Convenience alias of `$contacts->topics->update(...)`.
     *
     * @param array{id?: string, email?: string, topics: list<array{id: string, subscription: string}>} $params
     * @return array<mixed>
     */
    public function updateTopics(array $params): array
    {
        return $this->topics->update($params);
    }

    /**
     * A bare string is an id. Shared with {@see ContactsBatch}.
     *
     * @param string|array<string,mixed> $contact
     * @return array<string,mixed>
     */
    public static function normalize(string|array $contact): array
    {
        return is_string($contact) ? ['id' => $contact] : $contact;
    }

    /**
     * Email wins over id.
     *
     * @param array<string,mixed> $addr
     */
    private static function path(array $addr): string
    {
        return '/contacts/' . rawurlencode((string) ($addr['email'] ?? $addr['id'] ?? ''));
    }
}
