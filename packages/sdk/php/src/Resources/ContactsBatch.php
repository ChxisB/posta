<?php

declare(strict_types=1);

namespace MillionSend\Resources;

use MillionSend\HttpClient;
use MillionSend\Util;

/** Bulk contact creation, lookup and deletion (MillionSend extension; Resend imports via CSV and reads/deletes one at a time). */
final class ContactsBatch
{
    public function __construct(private readonly HttpClient $http) {}

    /**
     * POST /contacts/batch — 1..1000 contacts as a bare JSON array. Options:
     * `onConflict`/`on_conflict` (`error`, the default, `skip` or `upsert`) and
     * `batchValidation`/`batch_validation` (`strict`, the default, or
     * `permissive`, which reports per-item failures in `errors[]`).
     *
     * @param list<array<string,mixed>> $params
     * @param array{onConflict?: string, on_conflict?: string, batchValidation?: string, batch_validation?: string} $options
     * @return array<mixed>
     */
    public function create(array $params, array $options = []): array
    {
        $body = array_map(
            static fn (array $contact): array => Util::rename($contact, Contacts::WIRE_MAP),
            array_values($params),
        );
        $onConflict = $options['onConflict'] ?? $options['on_conflict'] ?? null;

        return $this->http->request(
            'POST',
            '/contacts/batch',
            $body,
            $onConflict === null ? [] : ['on_conflict' => (string) $onConflict],
            null,
            Util::optionHeaders($options),
        );
    }

    /**
     * POST /contacts/batch/get — 1..1000 contacts by id (a bare string) or by
     * `['id' => …]` / `['email' => …]` (exactly one per entry; emails match
     * case-insensitively). `data` lists the contacts found in request order;
     * entries that match nobody land in `missing` (with their request `index`)
     * instead of failing the call. `include` (`properties` and/or `topics`)
     * attaches those to every contact. One call is one request against the rate limit.
     *
     * @param list<string|array{id?: string, email?: string}> $contacts
     * @param array{include?: list<string>} $options
     * @return array<mixed>
     */
    public function get(array $contacts, array $options = []): array
    {
        $body = ['contacts' => array_map(Contacts::normalize(...), array_values($contacts))];
        if (isset($options['include'])) {
            $body['include'] = $options['include'];
        }

        return $this->http->request('POST', '/contacts/batch/get', $body);
    }

    /**
     * POST /contacts/batch/remove — by `ids` or by `emails` (exactly one, 1..1000).
     * Lists only the rows actually deleted; unknown ids/addresses are skipped.
     * The contacts' emails stay in the send log; `erase => true` also scrubs the
     * addresses from email history, event payloads and API logs (a GDPR/LGPD erasure).
     *
     * @param array{ids?: list<string>, emails?: list<string>, erase?: bool} $params
     * @return array<mixed>
     */
    public function remove(array $params): array
    {
        return $this->http->request('POST', '/contacts/batch/remove', Util::body($params));
    }
}
