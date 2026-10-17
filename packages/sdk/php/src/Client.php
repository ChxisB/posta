<?php

declare(strict_types=1);

namespace Posta;

use Posta\Resources\ApiKeys;
use Posta\Resources\Batch;
use Posta\Resources\Broadcasts;
use Posta\Resources\ContactProperties;
use Posta\Resources\Contacts;
use Posta\Resources\Deliverability;
use Posta\Resources\Domains;
use Posta\Resources\Emails;
use Posta\Resources\Segments;
use Posta\Resources\Suppressions;
use Posta\Resources\Templates;
use Posta\Resources\Topics;
use Posta\Resources\Usage;
use Posta\Resources\Webhooks;

/**
 * The Posta client. Build it once via {@see Posta::client()} and
 * reach every resource through its public accessors, e.g. `$ms->emails->send(...)`.
 */
final class Client
{
    public readonly Emails $emails;
    public readonly Batch $batch;
    public readonly Contacts $contacts;
    public readonly ContactProperties $contactProperties;
    public readonly Topics $topics;
    public readonly Broadcasts $broadcasts;
    public readonly Segments $segments;
    public readonly Suppressions $suppressions;
    public readonly Domains $domains;
    public readonly Webhooks $webhooks;
    public readonly ApiKeys $apiKeys;
    public readonly Templates $templates;
    public readonly Deliverability $deliverability;
    public readonly Usage $usage;

    /** Raw transport, for endpoints this SDK does not wrap yet: `$ms->http->request('POST', '/path', $body)`. */
    public function __construct(public readonly HttpClient $http)
    {
        $this->emails = new Emails($http);
        $this->batch = new Batch($http);
        $this->contacts = new Contacts($http);
        $this->contactProperties = new ContactProperties($http);
        $this->topics = new Topics($http);
        $this->broadcasts = new Broadcasts($http);
        $this->segments = new Segments($http);
        $this->suppressions = new Suppressions($http);
        $this->domains = new Domains($http);
        $this->webhooks = new Webhooks($http);
        $this->apiKeys = new ApiKeys($http);
        $this->templates = new Templates($http);
        $this->deliverability = new Deliverability($http);
        $this->usage = new Usage($http);
    }
}
