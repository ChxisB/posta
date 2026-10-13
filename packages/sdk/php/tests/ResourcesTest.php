<?php

declare(strict_types=1);

describe('emails', function () {
    it('get and cancel hit the right paths', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->get('e1');
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/emails/e1');

        $ms->emails->cancel('e1');
        expect($spy->at(1)->getMethod())->toBe('POST');
        expect($spy->at(1)->getUri()->getPath())->toBe('/emails/e1/cancel');
    });

    it('get surfaces the score field, present or null', function () {
        [$ms] = fakeClient(200, ['object' => 'email', 'id' => 'e1', 'score' => 8.5]);
        expect($ms->emails->get('e1')['score'])->toBe(8.5);

        [$ms] = fakeClient(200, ['object' => 'email', 'id' => 'e1', 'score' => null]);
        expect($ms->emails->get('e1')['score'])->toBeNull();
    });

    it('getInsights returns the full report', function () {
        $insights = [
            'object' => 'email_insights',
            'email_id' => 'e1',
            'score' => 8.5,
            'score_version' => 1,
            'band' => 'excellent',
            'marketing' => true,
            'html_size_bytes' => 12345,
            'computed_at' => '2026-08-31T12:00:00Z',
            'checks' => [
                [
                    'id' => 'list_unsubscribe',
                    'severity' => 'critical',
                    'status' => 'fail',
                    'penalty' => 1.25,
                    'detail' => ['header' => null, 'reason' => 'missing'],
                ],
                ['id' => 'plain_text_part', 'severity' => 'minor', 'status' => 'pass', 'penalty' => 0],
            ],
        ];
        [$ms, $spy] = fakeClient(200, $insights);

        expect($ms->emails->getInsights('e1'))->toEqual($insights);
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/emails/e1/insights');
    });

    it('getInsights passes unknown future check ids, statuses and bands through untouched', function () {
        [$ms] = fakeClient(200, [
            'object' => 'email_insights',
            'email_id' => 'e1',
            'score' => 5.0,
            'score_version' => 9,
            'band' => 'stellar',
            'marketing' => false,
            'html_size_bytes' => null,
            'computed_at' => '2026-08-31T12:00:00Z',
            'checks' => [['id' => 'brand_new_check', 'severity' => 'info', 'status' => 'deferred', 'penalty' => 0]],
        ]);
        $res = $ms->emails->getInsights('e1');

        expect($res['band'])->toBe('stellar');
        expect($res['checks'][0]['status'])->toBe('deferred');
    });

    it('getInsights throws not_found when insights are unavailable', function () {
        [$ms] = fakeClient(404, ['statusCode' => 404, 'name' => 'not_found', 'message' => 'Email not found']);

        try {
            $ms->emails->getInsights('missing');
            $this->fail('expected an ErrorException');
        } catch (MillionSend\Exceptions\ErrorException $e) {
            expect($e->getStatusCode())->toBe(404);
            expect($e->getErrorName())->toBe('not_found');
        }
    });
});

describe('deliverability', function () {
    it('get returns the account score', function () {
        $report = [
            'object' => 'deliverability',
            'score' => 8.7,
            'band' => 'good',
            'content_score' => 8.2,
            'outcome_score' => 9.1,
            'complaint_rate' => 0.0002,
            'hard_bounce_rate' => 0.001,
            'emails_sent' => 12345,
            'scored_recipients' => 23456,
            'window_days' => 30,
            'insufficient_outcome_data' => false,
            'guardrail_status' => 'ok',
            'score_version' => 1,
        ];
        [$ms, $spy] = fakeClient(200, $report);

        expect($ms->deliverability->get())->toEqual($report);
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/deliverability');
    });

    it('get keeps null scores null when there is not enough data', function () {
        [$ms] = fakeClient(200, [
            'object' => 'deliverability',
            'score' => null,
            'band' => null,
            'content_score' => null,
            'outcome_score' => null,
            'complaint_rate' => 0,
            'hard_bounce_rate' => 0,
            'emails_sent' => 0,
            'scored_recipients' => 0,
            'window_days' => 30,
            'insufficient_outcome_data' => true,
            'guardrail_status' => 'ok',
            'score_version' => 1,
        ]);
        $res = $ms->deliverability->get();

        expect($res['score'])->toBeNull();
        expect($res['band'])->toBeNull();
        expect($res['insufficient_outcome_data'])->toBeTrue();
    });
});

describe('batch', function () {
    it('sends a bare array body with an idempotency key', function () {
        [$ms, $spy] = fakeClient(200, ['data' => [['id' => '1'], ['id' => '2']]]);
        $res = $ms->batch->send(
            [
                ['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => '1', 'text' => 'one'],
                ['from' => 'a@x.dev', 'to' => 'c@x.dev', 'subject' => '2', 'text' => 'two'],
            ],
            ['idempotencyKey' => 'batch-1'],
        );

        expect($spy->at(0)->getUri()->getPath())->toBe('/emails/batch');
        $body = bodyOf($spy->at(0));
        expect(array_is_list($body))->toBeTrue();
        expect($body)->toHaveCount(2);
        expect($spy->at(0)->getHeaderLine('Idempotency-Key'))->toBe('batch-1');
        expect($res['data'])->toHaveCount(2);
    });
});

describe('contacts', function () {
    it('creates at the top-level /contacts', function () {
        [$ms, $spy] = fakeClient();

        $ms->contacts->create(['email' => 'c@x.dev', 'firstName' => 'Ada']);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts');
        expect(bodyOf($spy->at(0)))->toEqual(['email' => 'c@x.dev', 'first_name' => 'Ada']);
    });

    it('addresses by string id and by email (email wins)', function () {
        [$ms, $spy] = fakeClient();

        $ms->contacts->get('c1');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1');

        $ms->contacts->get(['email' => 'c@x.dev']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev'));

        $ms->contacts->get(['id' => 'c1', 'email' => 'c@x.dev']);
        expect($spy->at(2)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev'));
    });

    it('update sends only provided keys (null clears)', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->update(['id' => 'c1', 'firstName' => null, 'unsubscribed' => true]);

        expect($spy->at(0)->getMethod())->toBe('PATCH');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1');
        expect(bodyOf($spy->at(0)))->toEqual(['first_name' => null, 'unsubscribed' => true]);
    });

    it('remove and list', function () {
        [$ms, $spy] = fakeClient();

        $ms->contacts->remove(['email' => 'c@x.dev']);
        expect($spy->at(0)->getMethod())->toBe('DELETE');
        expect($spy->at(0)->getUri()->getQuery())->toBe('');

        $ms->contacts->list(['after' => 'cur']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts');
        expect($spy->at(1)->getUri()->getQuery())->toBe('after=cur');
    });

    it('remove sends ?erase=true only when asked', function () {
        [$ms, $spy] = fakeClient();

        $ms->contacts->remove('c1', ['erase' => true]);
        expect($spy->at(0)->getMethod())->toBe('DELETE');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1');
        expect($spy->at(0)->getUri()->getQuery())->toBe('erase=true');

        $ms->contacts->remove('c1', ['erase' => false]);
        expect($spy->at(1)->getUri()->getQuery())->toBe('');
    });

    it('topics->get lists the effective subscriptions of a contact addressed by email', function () {
        $list = [
            'object' => 'list',
            'has_more' => false,
            'data' => [
                ['id' => 't1', 'name' => 'Insights', 'description' => null, 'subscription' => 'opt_in', 'explicit' => false, 'visibility' => 'public'],
                ['id' => 't2', 'name' => 'Releases', 'description' => 'Ship notes', 'subscription' => 'opt_out', 'explicit' => true, 'visibility' => 'private'],
            ],
        ];
        [$ms, $spy] = fakeClient(200, $list);

        expect($ms->contacts->topics->get('c@x.dev'))->toBe($list);
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c%40x.dev/topics');
        expect($spy->at(0)->getUri()->getQuery())->toBe('');
        expect(bodyOf($spy->at(0)))->toBeNull();

        expect($ms->contacts->topics->list('c1'))->toBe($list);
        expect($spy->at(1)->getMethod())->toBe('GET');
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/c1/topics');
    });

    it('topics->update patches /contacts/:id/topics with the bare array', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'c1']);
        $ms->contacts->topics->update([
            'id' => 'c1',
            'topics' => [['id' => 't1', 'subscription' => 'opt_out']],
        ]);

        expect($spy->at(0)->getMethod())->toBe('PATCH');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1/topics');
        expect(bodyOf($spy->at(0)))->toEqual([['id' => 't1', 'subscription' => 'opt_out']]);
    });

    it('topics->update takes the resend-php ($idOrEmail, $topics) shape', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'c1']);
        $topics = [['id' => 't1', 'subscription' => 'opt_out'], ['id' => 't2', 'subscription' => 'opt_in']];

        $ms->contacts->topics->update('c@x.dev', $topics);
        expect($spy->at(0)->getMethod())->toBe('PATCH');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev') . '/topics');
        expect(bodyOf($spy->at(0)))->toBe($topics);

        $ms->contacts->topics->update('c1', ['topics' => $topics]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/c1/topics');
        expect(bodyOf($spy->at(1)))->toBe($topics);
    });

    it('updateTopics alias resolves the address by email', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'c1']);
        $ms->contacts->updateTopics([
            'email' => 'c@x.dev',
            'topics' => [['id' => 't1', 'subscription' => 'opt_in']],
        ]);

        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev') . '/topics');
    });
});

describe('broadcasts', function () {
    it('covers the full lifecycle', function () {
        [$ms, $spy] = fakeClient();

        $ms->broadcasts->create(['segmentId' => 's1', 'from' => 'a@x.dev', 'subject' => 'News', 'html' => '<p>hi</p>']);
        expect($spy->at(0)->getUri()->getPath())->toBe('/broadcasts');
        expect(bodyOf($spy->at(0)))->toEqual([
            'segment_id' => 's1',
            'from' => 'a@x.dev',
            'subject' => 'News',
            'html' => '<p>hi</p>',
        ]);

        $ms->broadcasts->get('b1');
        expect($spy->at(1)->getUri()->getPath())->toBe('/broadcasts/b1');

        $ms->broadcasts->list();
        expect($spy->at(2)->getUri()->getPath())->toBe('/broadcasts');

        $ms->broadcasts->update('b1', ['subject' => 'New']);
        expect($spy->at(3)->getMethod())->toBe('PATCH');
        expect($spy->at(3)->getUri()->getPath())->toBe('/broadcasts/b1');

        $ms->broadcasts->send('b1', ['scheduledAt' => '2999-01-01T00:00:00Z']);
        expect($spy->at(4)->getUri()->getPath())->toBe('/broadcasts/b1/send');
        expect(bodyOf($spy->at(4)))->toEqual(['scheduled_at' => '2999-01-01T00:00:00Z']);

        $ms->broadcasts->cancel('b1');
        expect($spy->at(5)->getUri()->getPath())->toBe('/broadcasts/b1/cancel');

        $ms->broadcasts->remove('b1');
        expect($spy->at(6)->getMethod())->toBe('DELETE');
    });

    it('send with no scheduledAt posts an empty object', function () {
        [$ms, $spy] = fakeClient();
        $ms->broadcasts->send('b1');

        expect((string) $spy->at(0)->getBody())->toBe('{}');
    });
});

describe('topics', function () {
    it('covers create/get/list/remove', function () {
        [$ms, $spy] = fakeClient();

        $ms->topics->create(['name' => 'Product', 'defaultSubscription' => 'opt_in']);
        expect(bodyOf($spy->at(0)))->toEqual(['name' => 'Product', 'default_subscription' => 'opt_in']);

        $ms->topics->get('t1');
        expect($spy->at(1)->getUri()->getPath())->toBe('/topics/t1');

        $ms->topics->list();
        expect($spy->at(2)->getUri()->getPath())->toBe('/topics');

        $ms->topics->remove('t1');
        expect($spy->at(3)->getMethod())->toBe('DELETE');
    });
});

describe('segments', function () {
    it('covers create/get/list/update/remove on /segments', function () {
        [$ms, $spy] = fakeClient();
        $filter = ['match' => 'all', 'conditions' => [['field' => 'email', 'op' => 'is_set']]];

        $ms->segments->create(['name' => 'Active', 'filter' => $filter]);
        expect($spy->at(0)->getUri()->getPath())->toBe('/segments');
        expect(bodyOf($spy->at(0)))->toEqual(['name' => 'Active', 'filter' => $filter]);

        $ms->segments->get('s1');
        expect($spy->at(1)->getUri()->getPath())->toBe('/segments/s1');

        $ms->segments->list(['before' => 'cur']);
        expect($spy->at(2)->getUri()->getPath())->toBe('/segments');
        expect($spy->at(2)->getUri()->getQuery())->toBe('before=cur');

        $ms->segments->update('s1', ['name' => 'Renamed', 'filter' => null]);
        expect($spy->at(3)->getMethod())->toBe('PATCH');
        expect($spy->at(3)->getUri()->getPath())->toBe('/segments/s1');
        expect(bodyOf($spy->at(3)))->toBe(['name' => 'Renamed', 'filter' => null]);

        $ms->segments->remove('s1');
        expect($spy->at(4)->getMethod())->toBe('DELETE');
    });
});

describe('emails (list, update, remove)', function () {
    it('lists with keyset params, reschedules and deletes', function () {
        [$ms, $spy] = fakeClient();

        $ms->emails->list(['limit' => 10, 'after' => 'cur']);
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/emails');
        expect($spy->at(0)->getUri()->getQuery())->toBe('limit=10&after=cur');

        $ms->emails->update('e1', ['scheduledAt' => '2999-01-01T00:00:00Z']);
        expect($spy->at(1)->getMethod())->toBe('PATCH');
        expect($spy->at(1)->getUri()->getPath())->toBe('/emails/e1');
        expect(bodyOf($spy->at(1)))->toBe(['scheduled_at' => '2999-01-01T00:00:00Z']);

        $ms->emails->update('e1', ['scheduled_at' => 'in 2 hours']);
        expect(bodyOf($spy->at(2)))->toBe(['scheduled_at' => 'in 2 hours']);

        $ms->emails->remove('e1');
        expect($spy->at(3)->getMethod())->toBe('DELETE');
        expect($spy->at(3)->getUri()->getPath())->toBe('/emails/e1');
    });
});

describe('batch validation', function () {
    it('sends x-batch-validation and surfaces permissive-mode errors', function () {
        [$ms, $spy] = fakeClient(200, [
            'data' => [['id' => '1']],
            'errors' => [['index' => 1, 'message' => 'Invalid `to`']],
        ]);
        $res = $ms->batch->send(
            [
                ['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => '1', 'text' => 'one', 'replyTo' => 'r@x.dev'],
                ['from' => 'a@x.dev', 'to' => 'nope', 'subject' => '2', 'text' => 'two', 'headers' => ['X-A' => '1']],
            ],
            ['batch_validation' => 'permissive', 'idempotency_key' => 'b-1'],
        );

        $req = $spy->at(0);
        expect($req->getHeaderLine('x-batch-validation'))->toBe('permissive');
        expect($req->getHeaderLine('Idempotency-Key'))->toBe('b-1');
        expect(bodyOf($req))->toBe([
            ['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => '1', 'text' => 'one', 'reply_to' => 'r@x.dev'],
            ['from' => 'a@x.dev', 'to' => 'nope', 'subject' => '2', 'text' => 'two', 'headers' => ['X-A' => '1']],
        ]);
        expect($res['errors'])->toBe([['index' => 1, 'message' => 'Invalid `to`']]);
    });

    it('accepts the camelCase option name and omits the header by default', function () {
        [$ms, $spy] = fakeClient(200, ['data' => []]);
        $ms->batch->create([['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'text' => 't']]);
        expect($spy->at(0)->hasHeader('x-batch-validation'))->toBeFalse();

        $ms->batch->create(
            [['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'text' => 't']],
            ['batchValidation' => 'strict'],
        );
        expect($spy->at(1)->getHeaderLine('x-batch-validation'))->toBe('strict');
    });
});

describe('contacts (full body, batch, segments)', function () {
    it('create puts every field on the wire', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->create([
            'email' => 'c@x.dev',
            'firstName' => 'Ada',
            'lastName' => 'Lovelace',
            'unsubscribed' => false,
            'properties' => ['plan' => 'pro', 'seats' => 3],
            'segments' => [['id' => 's1']],
            'topics' => [['id' => 't1', 'subscription' => 'opt_in']],
        ]);

        expect(bodyOf($spy->at(0)))->toBe([
            'email' => 'c@x.dev',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'unsubscribed' => false,
            'properties' => ['plan' => 'pro', 'seats' => 3],
            'segments' => [['id' => 's1']],
            'topics' => [['id' => 't1', 'subscription' => 'opt_in']],
        ]);
    });

    it('update takes the resend-php ($idOrEmail, $params) shape and clears with null', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->update('c@x.dev', ['lastName' => null, 'properties' => ['plan' => null]]);

        expect($spy->at(0)->getMethod())->toBe('PATCH');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev'));
        expect(bodyOf($spy->at(0)))->toBe(['last_name' => null, 'properties' => ['plan' => null]]);

        $ms->contacts->update(['id' => 'c1'], ['first_name' => 'Ada']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/c1');
        expect(bodyOf($spy->at(1)))->toBe(['first_name' => 'Ada']);
    });

    it('update with the single-array shape never leaks id/email into the body', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->update(['id' => 'c1', 'email' => 'c@x.dev', 'first_name' => 'Ada']);

        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev'));
        expect(bodyOf($spy->at(0)))->toBe(['first_name' => 'Ada']);
    });

    it('list routes to /segments/:id/contacts when a segment is given', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->list(['segmentId' => 's1', 'limit' => 5]);
        expect($spy->at(0)->getUri()->getPath())->toBe('/segments/s1/contacts');
        expect($spy->at(0)->getUri()->getQuery())->toBe('limit=5');

        $ms->contacts->list(['segment_id' => 's2']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/segments/s2/contacts');
    });

    it('list joins include into one comma-separated query parameter, on the team and segment lists alike', function () {
        [$ms, $spy] = fakeClient();
        $ms->contacts->list(['limit' => 100, 'include' => ['properties', 'topics']]);
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts');
        expect($spy->at(0)->getUri()->getQuery())->toBe('limit=100&include=' . rawurlencode('properties,topics'));

        $ms->contacts->list(['segmentId' => 's1', 'include' => ['topics']]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/segments/s1/contacts');
        expect($spy->at(1)->getUri()->getQuery())->toBe('include=topics');

        $ms->contacts->list();
        expect($spy->at(2)->getUri()->getQuery())->toBe('');
    });

    it('batch->create posts a bare array with on_conflict and the validation header', function () {
        $response = [
            'data' => [['object' => 'contact', 'index' => 0, 'id' => 'c1', 'status' => 'created']],
            'counts' => ['created' => 1, 'updated' => 0, 'skipped' => 0, 'failed' => 1],
            'errors' => [['index' => 1, 'message' => 'Invalid email']],
        ];
        [$ms, $spy] = fakeClient(200, $response);
        $res = $ms->contacts->batch->create(
            [
                ['email' => 'a@x.dev', 'firstName' => 'A', 'topics' => [['id' => 't1', 'subscription' => 'opt_out']]],
                ['email' => 'nope', 'last_name' => 'B'],
            ],
            ['on_conflict' => 'upsert', 'batch_validation' => 'permissive'],
        );

        $req = $spy->at(0);
        expect($req->getMethod())->toBe('POST');
        expect($req->getUri()->getPath())->toBe('/contacts/batch');
        expect($req->getUri()->getQuery())->toBe('on_conflict=upsert');
        expect($req->getHeaderLine('x-batch-validation'))->toBe('permissive');
        expect(bodyOf($req))->toBe([
            ['email' => 'a@x.dev', 'first_name' => 'A', 'topics' => [['id' => 't1', 'subscription' => 'opt_out']]],
            ['email' => 'nope', 'last_name' => 'B'],
        ]);
        expect($res)->toBe($response);

        $ms->contacts->batch->create([['email' => 'a@x.dev']], ['onConflict' => 'skip']);
        expect($spy->at(1)->getUri()->getQuery())->toBe('on_conflict=skip');
        expect($spy->at(1)->hasHeader('x-batch-validation'))->toBeFalse();

        $ms->contacts->batch->create([['email' => 'a@x.dev']]);
        expect($spy->at(2)->getUri()->getQuery())->toBe('');
    });

    it('batch->get posts ids and emails with include to /contacts/batch/get and surfaces missing entries', function () {
        $response = [
            'object' => 'list',
            'data' => [[
                'object' => 'contact', 'id' => 'c1', 'email' => 'a@x.dev', 'first_name' => 'A', 'last_name' => null,
                'created_at' => '2026-01-01T00:00:00.000Z', 'unsubscribed' => false,
                'properties' => ['plan' => ['type' => 'string', 'value' => 'pro']],
                'topics' => [['id' => 't1', 'name' => 'Insights', 'description' => null, 'subscription' => 'opt_in', 'explicit' => false, 'visibility' => 'public']],
            ]],
            'missing' => [['index' => 1, 'email' => 'nobody@x.dev']],
        ];
        [$ms, $spy] = fakeClient(200, $response);

        $res = $ms->contacts->batch->get(['c1', ['email' => 'nobody@x.dev']], ['include' => ['properties', 'topics']]);
        expect($res)->toBe($response);
        expect($res['missing'])->toBe([['index' => 1, 'email' => 'nobody@x.dev']]);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/batch/get');
        expect(bodyOf($spy->at(0)))->toBe([
            'contacts' => [['id' => 'c1'], ['email' => 'nobody@x.dev']],
            'include' => ['properties', 'topics'],
        ]);

        $ms->contacts->batch->get([['id' => 'c2']]);
        expect(bodyOf($spy->at(1)))->toBe(['contacts' => [['id' => 'c2']]]);
    });

    it('batch->remove posts ids or emails to /contacts/batch/remove', function () {
        $response = ['data' => [['object' => 'contact', 'contact' => 'c1', 'deleted' => true]]];
        [$ms, $spy] = fakeClient(200, $response);

        expect($ms->contacts->batch->remove(['ids' => ['c1', 'c2']]))->toBe($response);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/batch/remove');
        expect(bodyOf($spy->at(0)))->toBe(['ids' => ['c1', 'c2']]);

        $ms->contacts->batch->remove(['emails' => ['a@x.dev']]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/batch/remove');
        expect(bodyOf($spy->at(1)))->toBe(['emails' => ['a@x.dev']]);

        $ms->contacts->batch->remove(['emails' => ['a@x.dev'], 'erase' => true]);
        expect(bodyOf($spy->at(2)))->toBe(['emails' => ['a@x.dev'], 'erase' => true]);
    });

    it('preferencesLink posts without a body, addressed by id or email', function () {
        $response = ['object' => 'preferences_link', 'contact' => 'c1', 'url' => 'https://app.test/unsubscribe/tok'];
        [$ms, $spy] = fakeClient(200, $response);

        expect($ms->contacts->preferencesLink('c1'))->toBe($response);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1/preferences-link');
        expect((string) $spy->at(0)->getBody())->toBe('');

        $ms->contacts->preferencesLink('c@x.dev');
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev') . '/preferences-link');

        $ms->contacts->preferencesLink(['id' => 'c1', 'email' => 'c@x.dev']);
        expect($spy->at(2)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev') . '/preferences-link');
    });

    it('preferencesLink surfaces the 422 of an instance without hosted links', function () {
        [$ms] = fakeClient(422, ['statusCode' => 422, 'name' => 'validation_error', 'message' => 'APP_BASE_URL must be set']);

        try {
            $ms->contacts->preferencesLink('c1');
            $this->fail('expected an ErrorException');
        } catch (MillionSend\Exceptions\ErrorException $e) {
            expect($e->getStatusCode())->toBe(422);
            expect($e->getErrorName())->toBe('validation_error');
        }
    });

    it('segments->add and ->remove address the contact by id or email', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'c1']);

        $ms->contacts->segments->add('c1', 's1');
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contacts/c1/segments/s1');
        expect((string) $spy->at(0)->getBody())->toBe('');

        $ms->contacts->segments->remove('c@x.dev', 's1');
        expect($spy->at(1)->getMethod())->toBe('DELETE');
        expect($spy->at(1)->getUri()->getPath())->toBe('/contacts/' . rawurlencode('c@x.dev') . '/segments/s1');
    });
});

describe('broadcasts (full body)', function () {
    it('create puts every field on the wire', function () {
        [$ms, $spy] = fakeClient();
        $ms->broadcasts->create([
            'name' => 'Launch',
            'segmentId' => 's1',
            'from' => 'Acme <a@x.dev>',
            'subject' => 'News',
            'html' => '<p>hi</p>',
            'text' => 'hi',
            'replyTo' => ['r@x.dev'],
            'previewText' => 'Preview',
            'topicId' => 't1',
            'send' => true,
            'scheduledAt' => '2999-01-01T00:00:00Z',
        ]);

        expect(bodyOf($spy->at(0)))->toBe([
            'name' => 'Launch',
            'segment_id' => 's1',
            'from' => 'Acme <a@x.dev>',
            'subject' => 'News',
            'html' => '<p>hi</p>',
            'text' => 'hi',
            'reply_to' => ['r@x.dev'],
            'preview_text' => 'Preview',
            'topic_id' => 't1',
            'send' => true,
            'scheduled_at' => '2999-01-01T00:00:00Z',
        ]);
    });

    it('update clears topic and segment with explicit nulls', function () {
        [$ms, $spy] = fakeClient();
        $ms->broadcasts->update('b1', ['topicId' => null, 'segment_id' => null, 'name' => 'Renamed']);

        expect(bodyOf($spy->at(0)))->toBe(['topic_id' => null, 'segment_id' => null, 'name' => 'Renamed']);
    });
});

describe('topics (update, visibility)', function () {
    it('creates with visibility and patches name/visibility', function () {
        [$ms, $spy] = fakeClient();

        $ms->topics->create(['name' => 'Product', 'description' => 'Releases', 'default_subscription' => 'opt_in', 'visibility' => 'public']);
        expect(bodyOf($spy->at(0)))->toBe(['name' => 'Product', 'description' => 'Releases', 'default_subscription' => 'opt_in', 'visibility' => 'public']);

        $ms->topics->update('t1', ['visibility' => 'private']);
        expect($spy->at(1)->getMethod())->toBe('PATCH');
        expect($spy->at(1)->getUri()->getPath())->toBe('/topics/t1');
        expect(bodyOf($spy->at(1)))->toBe(['visibility' => 'private']);
    });
});

describe('suppressions', function () {
    it('covers add/create/get/list/remove', function () {
        [$ms, $spy] = fakeClient();

        $ms->suppressions->add(['email' => 'x@x.dev', 'origin' => 'manual']);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/suppressions');
        expect(bodyOf($spy->at(0)))->toBe(['email' => 'x@x.dev', 'origin' => 'manual']);

        $ms->suppressions->create(['email' => 'y@x.dev']);
        expect(bodyOf($spy->at(1)))->toBe(['email' => 'y@x.dev']);

        $ms->suppressions->get('x@x.dev');
        expect($spy->at(2)->getMethod())->toBe('GET');
        expect($spy->at(2)->getUri()->getPath())->toBe('/suppressions/' . rawurlencode('x@x.dev'));

        $ms->suppressions->list(['limit' => 20, 'origin' => 'bounce']);
        expect($spy->at(3)->getUri()->getPath())->toBe('/suppressions');
        expect($spy->at(3)->getUri()->getQuery())->toBe('limit=20&origin=bounce');

        $ms->suppressions->remove('sup_1');
        expect($spy->at(4)->getMethod())->toBe('DELETE');
        expect($spy->at(4)->getUri()->getPath())->toBe('/suppressions/sup_1');
    });

    it('batch->add and batch->remove post to the batch endpoints', function () {
        [$ms, $spy] = fakeClient(200, ['data' => [['object' => 'suppression', 'id' => 's1']]]);

        $ms->suppressions->batch->add(['emails' => ['a@x.dev', 'b@x.dev'], 'origin' => 'unsubscribe']);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/suppressions/batch/add');
        expect(bodyOf($spy->at(0)))->toBe(['emails' => ['a@x.dev', 'b@x.dev'], 'origin' => 'unsubscribe']);

        $ms->suppressions->batch->remove(['emails' => ['a@x.dev']]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/suppressions/batch/remove');
        expect(bodyOf($spy->at(1)))->toBe(['emails' => ['a@x.dev']]);

        $ms->suppressions->batch->remove(['ids' => ['s1', 's2']]);
        expect(bodyOf($spy->at(2)))->toBe(['ids' => ['s1', 's2']]);
    });
});

describe('domains', function () {
    it('covers create/list/get/verify/update/remove', function () {
        [$ms, $spy] = fakeClient();

        $ms->domains->create([
            'name' => 'acme.dev',
            'region' => 'us-east-1',
            'customReturnPath' => 'bounces',
            'openTracking' => true,
            'clickTracking' => false,
            'trackingSubdomain' => 'track',
        ]);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/domains');
        expect(bodyOf($spy->at(0)))->toBe([
            'name' => 'acme.dev',
            'region' => 'us-east-1',
            'custom_return_path' => 'bounces',
            'open_tracking' => true,
            'click_tracking' => false,
            'tracking_subdomain' => 'track',
        ]);

        $ms->domains->list(['limit' => 10]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/domains');
        expect($spy->at(1)->getUri()->getQuery())->toBe('limit=10');

        $ms->domains->get('d1');
        expect($spy->at(2)->getMethod())->toBe('GET');
        expect($spy->at(2)->getUri()->getPath())->toBe('/domains/d1');

        $ms->domains->verify('d1');
        expect($spy->at(3)->getMethod())->toBe('POST');
        expect($spy->at(3)->getUri()->getPath())->toBe('/domains/d1/verify');

        $ms->domains->update('d1', ['open_tracking' => false, 'clickTracking' => true, 'trackingSubdomain' => null]);
        expect($spy->at(4)->getMethod())->toBe('PATCH');
        expect($spy->at(4)->getUri()->getPath())->toBe('/domains/d1');
        expect(bodyOf($spy->at(4)))->toBe(['open_tracking' => false, 'click_tracking' => true, 'tracking_subdomain' => null]);

        $ms->domains->remove('d1');
        expect($spy->at(5)->getMethod())->toBe('DELETE');
        expect($spy->at(5)->getUri()->getPath())->toBe('/domains/d1');
    });
});

describe('webhooks', function () {
    it('covers create/list/get/update/remove', function () {
        [$ms, $spy] = fakeClient(200, ['object' => 'webhook', 'id' => 'w1', 'signing_secret' => 'whsec_1']);

        $res = $ms->webhooks->create([
            'endpoint' => 'https://acme.dev/hooks',
            'events' => ['email.sent', 'email.bounced'],
            'signingSecret' => 'whsec_1',
        ]);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/webhooks');
        expect(bodyOf($spy->at(0)))->toBe([
            'endpoint' => 'https://acme.dev/hooks',
            'events' => ['email.sent', 'email.bounced'],
            'signing_secret' => 'whsec_1',
        ]);
        expect($res['signing_secret'])->toBe('whsec_1');

        $ms->webhooks->list(['after' => 'cur']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/webhooks');
        expect($spy->at(1)->getUri()->getQuery())->toBe('after=cur');

        $ms->webhooks->get('w1');
        expect($spy->at(2)->getMethod())->toBe('GET');
        expect($spy->at(2)->getUri()->getPath())->toBe('/webhooks/w1');

        $ms->webhooks->update('w1', ['status' => 'disabled', 'events' => ['email.delivered']]);
        expect($spy->at(3)->getMethod())->toBe('PATCH');
        expect($spy->at(3)->getUri()->getPath())->toBe('/webhooks/w1');
        expect(bodyOf($spy->at(3)))->toBe(['status' => 'disabled', 'events' => ['email.delivered']]);

        $ms->webhooks->remove('w1');
        expect($spy->at(4)->getMethod())->toBe('DELETE');
        expect($spy->at(4)->getUri()->getPath())->toBe('/webhooks/w1');
    });

    it('get surfaces previous_secret_expires_at, set or null', function () {
        [$ms] = fakeClient(200, ['object' => 'webhook', 'id' => 'w1', 'signing_secret' => 'whsec_1', 'previous_secret_expires_at' => '2026-01-02T00:00:00.000Z']);
        expect($ms->webhooks->get('w1')['previous_secret_expires_at'])->toBe('2026-01-02T00:00:00.000Z');

        [$ms] = fakeClient(200, ['object' => 'webhook', 'id' => 'w1', 'signing_secret' => 'whsec_1', 'previous_secret_expires_at' => null]);
        expect($ms->webhooks->get('w1')['previous_secret_expires_at'])->toBeNull();
    });

    it('rotate posts {} by default and maps signingSecret/overlapHours to the wire', function () {
        $response = ['object' => 'webhook', 'id' => 'w1', 'signing_secret' => 'whsec_2', 'previous_secret_expires_at' => null];
        [$ms, $spy] = fakeClient(200, $response);

        expect($ms->webhooks->rotate('w1'))->toBe($response);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/webhooks/w1/rotate');
        expect((string) $spy->at(0)->getBody())->toBe('{}');

        $ms->webhooks->rotate('w1', ['signingSecret' => 'whsec_mine', 'overlapHours' => 0]);
        expect(bodyOf($spy->at(1)))->toBe(['signing_secret' => 'whsec_mine', 'overlap_hours' => 0]);

        $ms->webhooks->rotate('w1', ['overlap_hours' => 72]);
        expect(bodyOf($spy->at(2)))->toBe(['overlap_hours' => 72]);
    });
});

describe('apiKeys', function () {
    it('covers create/list/remove', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'k1', 'token' => 'ms_secret']);

        $res = $ms->apiKeys->create(['name' => 'ci', 'permission' => 'sending_access', 'domainId' => 'd1']);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/api-keys');
        expect(bodyOf($spy->at(0)))->toBe(['name' => 'ci', 'permission' => 'sending_access', 'domain_id' => 'd1']);
        expect($res['token'])->toBe('ms_secret');

        $ms->apiKeys->list(['limit' => 5]);
        expect($spy->at(1)->getMethod())->toBe('GET');
        expect($spy->at(1)->getUri()->getPath())->toBe('/api-keys');
        expect($spy->at(1)->getUri()->getQuery())->toBe('limit=5');

        $ms->apiKeys->remove('k1');
        expect($spy->at(2)->getMethod())->toBe('DELETE');
        expect($spy->at(2)->getUri()->getPath())->toBe('/api-keys/k1');
    });
});

describe('templates', function () {
    it('covers create/list/get/update/remove/publish/duplicate', function () {
        [$ms, $spy] = fakeClient(200, ['object' => 'template', 'id' => 'tp1']);

        $ms->templates->create([
            'name' => 'Welcome',
            'html' => '<p>Hi {{{name}}}</p>',
            'subject' => 'Welcome',
            'text' => 'Hi',
            'alias' => 'welcome',
            'replyTo' => 'support@x.dev',
        ]);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/templates');
        expect(bodyOf($spy->at(0)))->toBe([
            'name' => 'Welcome',
            'html' => '<p>Hi {{{name}}}</p>',
            'subject' => 'Welcome',
            'text' => 'Hi',
            'alias' => 'welcome',
            'reply_to' => 'support@x.dev',
        ]);

        $ms->templates->list(['before' => 'cur']);
        expect($spy->at(1)->getUri()->getPath())->toBe('/templates');
        expect($spy->at(1)->getUri()->getQuery())->toBe('before=cur');

        $ms->templates->get('welcome');
        expect($spy->at(2)->getMethod())->toBe('GET');
        expect($spy->at(2)->getUri()->getPath())->toBe('/templates/welcome');

        $ms->templates->update('welcome', ['alias' => null, 'subject' => null, 'text' => null, 'html' => '<p>v2</p>']);
        expect($spy->at(3)->getMethod())->toBe('PATCH');
        expect($spy->at(3)->getUri()->getPath())->toBe('/templates/welcome');
        expect(bodyOf($spy->at(3)))->toBe(['alias' => null, 'subject' => null, 'text' => null, 'html' => '<p>v2</p>']);

        $ms->templates->remove('tp1');
        expect($spy->at(4)->getMethod())->toBe('DELETE');
        expect($spy->at(4)->getUri()->getPath())->toBe('/templates/tp1');

        $ms->templates->publish('tp1');
        expect($spy->at(5)->getMethod())->toBe('POST');
        expect($spy->at(5)->getUri()->getPath())->toBe('/templates/tp1/publish');

        $ms->templates->duplicate('tp1');
        expect($spy->at(6)->getMethod())->toBe('POST');
        expect($spy->at(6)->getUri()->getPath())->toBe('/templates/tp1/duplicate');
    });
});

describe('contactProperties', function () {
    it('covers create/list/get/update/remove', function () {
        [$ms, $spy] = fakeClient(200, ['object' => 'contact_property', 'id' => 'p1']);

        $ms->contactProperties->create(['key' => 'plan', 'type' => 'string', 'fallbackValue' => 'free']);
        expect($spy->at(0)->getMethod())->toBe('POST');
        expect($spy->at(0)->getUri()->getPath())->toBe('/contact-properties');
        expect(bodyOf($spy->at(0)))->toBe(['key' => 'plan', 'type' => 'string', 'fallback_value' => 'free']);

        $ms->contactProperties->list(['limit' => 50]);
        expect($spy->at(1)->getUri()->getPath())->toBe('/contact-properties');
        expect($spy->at(1)->getUri()->getQuery())->toBe('limit=50');

        $ms->contactProperties->get('p1');
        expect($spy->at(2)->getMethod())->toBe('GET');
        expect($spy->at(2)->getUri()->getPath())->toBe('/contact-properties/p1');

        $ms->contactProperties->update('p1', ['fallback_value' => null]);
        expect($spy->at(3)->getMethod())->toBe('PATCH');
        expect($spy->at(3)->getUri()->getPath())->toBe('/contact-properties/p1');
        expect(bodyOf($spy->at(3)))->toBe(['fallback_value' => null]);

        $ms->contactProperties->remove('p1');
        expect($spy->at(4)->getMethod())->toBe('DELETE');
        expect($spy->at(4)->getUri()->getPath())->toBe('/contact-properties/p1');
    });
});

describe('usage', function () {
    it('get returns the plan report', function () {
        $report = [
            'object' => 'usage',
            'cloud' => true,
            'plan' => 'pro',
            'limits' => ['emails_per_day' => 50000, 'domains' => 10],
            'today' => ['emails_sent' => 120, 'resets_at' => '2026-09-05T00:00:00Z'],
            'team' => ['id' => 'team_1', 'name' => 'Acme'],
            'app_url' => 'https://app.millionsend.com',
        ];
        [$ms, $spy] = fakeClient(200, $report);

        expect($ms->usage->get())->toBe($report);
        expect($spy->at(0)->getMethod())->toBe('GET');
        expect($spy->at(0)->getUri()->getPath())->toBe('/usage');
    });
});
