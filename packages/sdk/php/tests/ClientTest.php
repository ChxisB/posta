<?php

declare(strict_types=1);

use MillionSend\Client;
use MillionSend\Exceptions\ErrorException;
use MillionSend\MillionSend;

describe('construction', function () {
    it('throws without an API key and without the env var', function () {
        $prev = getenv('MILLIONSEND_API_KEY');
        putenv('MILLIONSEND_API_KEY');

        expect(fn () => MillionSend::client())->toThrow(InvalidArgumentException::class);

        if ($prev !== false) {
            putenv('MILLIONSEND_API_KEY=' . $prev);
        }
    });

    it('falls back to MILLIONSEND_API_KEY', function () {
        $prev = getenv('MILLIONSEND_API_KEY');
        putenv('MILLIONSEND_API_KEY=ms_env');

        expect(MillionSend::client())->toBeInstanceOf(Client::class);

        putenv($prev === false ? 'MILLIONSEND_API_KEY' : 'MILLIONSEND_API_KEY=' . $prev);
    });

    it('rejects invalid request deadlines', function () {
        expect(fn () => MillionSend::client('ms_test', null, ['timeout' => 0.0]))
            ->toThrow(InvalidArgumentException::class);
    });

    it('refuses a non-loopback http base URL unless allowInsecureHttp is set', function () {
        expect(fn () => MillionSend::client('ms_test', 'http://mail.example.com'))
            ->toThrow(InvalidArgumentException::class, 'allowInsecureHttp');

        $prev = getenv('MILLIONSEND_BASE_URL');
        putenv('MILLIONSEND_BASE_URL=http://mail.example.com');
        try {
            expect(fn () => MillionSend::client('ms_test'))->toThrow(InvalidArgumentException::class);
        } finally {
            putenv($prev === false ? 'MILLIONSEND_BASE_URL' : 'MILLIONSEND_BASE_URL=' . $prev);
        }

        expect(MillionSend::client('ms_test', 'http://mail.example.com', ['allowInsecureHttp' => true]))
            ->toBeInstanceOf(Client::class);
        expect(MillionSend::client('ms_test', 'http://localhost:3001'))->toBeInstanceOf(Client::class);
        expect(MillionSend::client('ms_test', 'http://127.0.0.1:3001'))->toBeInstanceOf(Client::class);
    });

    it('keeps the API key out of debug output', function () {
        $ms = MillionSend::client('ms_secret_key', 'https://api.test');

        expect(print_r($ms, true))->not->toContain('ms_secret_key');
        ob_start();
        var_dump($ms);
        expect((string) ob_get_clean())->not->toContain('ms_secret_key');
    });

    it('defaults the base URL to MillionSend Cloud; the env var and the explicit argument win', function () {
        $prev = getenv('MILLIONSEND_BASE_URL');
        putenv('MILLIONSEND_BASE_URL');
        try {
            [$ms, $spy] = fakeClient(200, ['id' => 'e1'], null);
            $ms->emails->get('e1');
            expect((string) $spy->last()->getUri())->toBe('https://api.millionsend.com/emails/e1');

            putenv('MILLIONSEND_BASE_URL=https://env.test');
            [$ms, $spy] = fakeClient(200, ['id' => 'e1'], null);
            $ms->emails->get('e1');
            expect((string) $spy->last()->getUri())->toBe('https://env.test/emails/e1');

            [$ms, $spy] = fakeClient(200, ['id' => 'e1'], 'https://explicit.test');
            $ms->emails->get('e1');
            expect((string) $spy->last()->getUri())->toBe('https://explicit.test/emails/e1');
        } finally {
            putenv($prev === false ? 'MILLIONSEND_BASE_URL' : 'MILLIONSEND_BASE_URL=' . $prev);
        }
    });

    it('strips a trailing slash from the base URL', function () {
        [$ms, $spy] = fakeClient(200, ['id' => 'e1'], 'https://api.test/');
        $ms->emails->get('e1');

        expect((string) $spy->last()->getUri())->toBe('https://api.test/emails/e1');
    });
});

describe('request wiring', function () {
    it('exposes the transport for endpoints the SDK does not wrap', function () {
        [$ms, $spy] = fakeClient(200, ['ok' => true]);

        expect($ms->http->request('POST', '/future/thing', ['a' => 1], ['q' => 'x'], 'idem-1'))->toBe(['ok' => true]);
        $req = $spy->last();
        expect($req->getMethod())->toBe('POST');
        expect($req->getUri()->getPath())->toBe('/future/thing');
        expect($req->getUri()->getQuery())->toBe('q=x');
        expect(bodyOf($req))->toBe(['a' => 1]);
        expect($req->getHeaderLine('Authorization'))->toBe('Bearer ms_test');
        expect($req->getHeaderLine('Idempotency-Key'))->toBe('idem-1');
    });

    it('sets Bearer auth, Accept, User-Agent and Content-Type on writes', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->send(['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'html' => '<p>h</p>']);

        $req = $spy->last();
        expect($req->getHeaderLine('Authorization'))->toBe('Bearer ms_test');
        expect($req->getHeaderLine('Accept'))->toBe('application/json');
        expect($req->getHeaderLine('Content-Type'))->toBe('application/json');
        expect($req->getHeaderLine('User-Agent'))->toMatch('/^millionsend-php\/\d/');
    });

    it('maps camelCase inputs to the snake_case wire and omits absent keys', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->send([
            'from' => 'a@x.dev',
            'to' => ['b@x.dev'],
            'subject' => 's',
            'html' => '<p>h</p>',
            'replyTo' => 'r@x.dev',
            'scheduledAt' => '2999-01-01T00:00:00Z',
        ]);

        expect(bodyOf($spy->last()))->toEqual([
            'from' => 'a@x.dev',
            'to' => ['b@x.dev'],
            'subject' => 's',
            'html' => '<p>h</p>',
            'reply_to' => 'r@x.dev',
            'scheduled_at' => '2999-01-01T00:00:00Z',
        ]);
    });

    it('sends Idempotency-Key on POST when provided', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->send(
            ['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'text' => 't'],
            ['idempotencyKey' => 'key-123'],
        );

        expect($spy->last()->getHeaderLine('Idempotency-Key'))->toBe('key-123');
    });

    it('never sends an Idempotency-Key on a GET', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->get('e1');

        expect($spy->last()->getHeaderLine('Idempotency-Key'))->toBe('');
    });

    it('returns the decoded body on 2xx', function () {
        [$ms] = fakeClient(200, ['id' => 'abc']);
        $res = $ms->emails->send(['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'text' => 't']);

        expect($res)->toEqual(['id' => 'abc']);
    });

    it('throws a normalized ErrorException on non-2xx', function () {
        [$ms] = fakeClient(422, ['statusCode' => 422, 'name' => 'validation_error', 'message' => 'bad']);

        try {
            $ms->emails->send(['from' => 'a@x.dev', 'to' => 'b@x.dev', 'subject' => 's', 'text' => 't']);
            $this->fail('expected an ErrorException');
        } catch (ErrorException $e) {
            expect($e->getStatusCode())->toBe(422);
            expect($e->getErrorName())->toBe('validation_error');
            expect($e->getErrorMessage())->toBe('bad');
        }
    });

    it('surfaces a transport failure as statusCode null', function () {
        $ms = failingClient();

        try {
            $ms->emails->get('e1');
            $this->fail('expected an ErrorException');
        } catch (ErrorException $e) {
            expect($e->getStatusCode())->toBeNull();
            expect($e->getErrorName())->toBe('application_error');
            expect($e->getMessage())->toContain('ECONNREFUSED');
        }
    });

    it('falls back to a generic error when the body is not the canonical shape', function () {
        [$ms] = fakeClient(500, 'gateway boom');

        try {
            $ms->emails->get('e1');
            $this->fail('expected an ErrorException');
        } catch (ErrorException $e) {
            expect($e->getErrorName())->toBe('application_error');
            expect($e->getMessage())->toBe('Request failed with status 500');
            expect($e->getStatusCode())->toBe(500);
        }
    });
});

describe('wire body completeness', function () {
    it('puts every send field on the wire, renaming only the camelCase aliases', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->send([
            'from' => 'Acme <a@x.dev>',
            'to' => ['b@x.dev'],
            'subject' => 's',
            'html' => '<p>h</p>',
            'text' => 'h',
            'cc' => ['c@x.dev'],
            'bcc' => 'd@x.dev',
            'replyTo' => ['r@x.dev'],
            'scheduledAt' => '2999-01-01T00:00:00Z',
            'tags' => [['name' => 'category', 'value' => 'launch']],
            'topicId' => '0f2f6b1e-6b2e-4d7a-9a1e-1a2b3c4d5e6f',
            'attachments' => [[
                'filename' => 'a.txt',
                'content' => base64_encode('hello'),
                'content_type' => 'text/plain',
                'content_id' => 'cid1',
                'path' => 'https://x.dev/a.txt',
            ]],
            'headers' => ['X-Entity-Ref-ID' => '123'],
            'template' => ['id' => 'tmpl_1', 'variables' => ['name' => 'Ada']],
        ]);

        expect(bodyOf($spy->last()))->toBe([
            'from' => 'Acme <a@x.dev>',
            'to' => ['b@x.dev'],
            'subject' => 's',
            'html' => '<p>h</p>',
            'text' => 'h',
            'cc' => ['c@x.dev'],
            'bcc' => 'd@x.dev',
            'reply_to' => ['r@x.dev'],
            'scheduled_at' => '2999-01-01T00:00:00Z',
            'tags' => [['name' => 'category', 'value' => 'launch']],
            'topic_id' => '0f2f6b1e-6b2e-4d7a-9a1e-1a2b3c4d5e6f',
            'attachments' => [[
                'filename' => 'a.txt',
                'content' => base64_encode('hello'),
                'content_type' => 'text/plain',
                'content_id' => 'cid1',
                'path' => 'https://x.dev/a.txt',
            ]],
            'headers' => ['X-Entity-Ref-ID' => '123'],
            'template' => ['id' => 'tmpl_1', 'variables' => ['name' => 'Ada']],
        ]);
    });

    it('passes a verbatim resend-php snake_case payload through unchanged', function () {
        [$ms, $spy] = fakeClient();
        $payload = [
            'from' => 'a@x.dev',
            'to' => 'b@x.dev',
            'subject' => 's',
            'text' => 't',
            'reply_to' => 'r@x.dev',
            'scheduled_at' => 'in 1 hour',
            'topic_id' => null,
        ];
        $ms->emails->send($payload, ['idempotency_key' => 'resend-shape']);

        expect(bodyOf($spy->last()))->toBe($payload);
        expect($spy->last()->getHeaderLine('Idempotency-Key'))->toBe('resend-shape');
    });

    it('sends the User-Agent with the current version', function () {
        [$ms, $spy] = fakeClient();
        $ms->emails->get('e1');

        expect($spy->last()->getHeaderLine('User-Agent'))->toBe('millionsend-php/0.8.0');
    });
});
