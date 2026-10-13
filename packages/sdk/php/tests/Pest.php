<?php

declare(strict_types=1);

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Promise\FulfilledPromise;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Promise\RejectedPromise;
use GuzzleHttp\Psr7\Response;
use MillionSend\Client;
use MillionSend\MillionSend;
use Psr\Http\Message\RequestInterface;

/** Records every outgoing request so tests can assert method/path/body/headers. */
final class RequestSpy
{
    /** @var list<RequestInterface> */
    public array $requests = [];

    public function at(int $index): RequestInterface
    {
        return $this->requests[$index];
    }

    public function last(): RequestInterface
    {
        return $this->requests[array_key_last($this->requests)];
    }
}

/**
 * A MillionSend client backed by a stub Guzzle handler that returns a fixed
 * response and records each request into the returned spy.
 *
 * @param array<mixed>|string $body
 * @return array{0: Client, 1: RequestSpy}
 */
function fakeClient(int $status = 200, array|string $body = ['id' => 'id_1'], ?string $baseUrl = 'https://api.test'): array
{
    $spy = new RequestSpy();
    $payload = is_string($body) ? $body : (string) json_encode($body);

    $handler = function (RequestInterface $request, array $options) use ($spy, $status, $payload): PromiseInterface {
        $spy->requests[] = $request;

        return new FulfilledPromise(new Response($status, ['Content-Type' => 'application/json'], $payload));
    };

    $guzzle = new GuzzleClient(['handler' => $handler]);
    $client = MillionSend::client('ms_test', $baseUrl, ['client' => $guzzle]);

    return [$client, $spy];
}

/** A client whose transport always fails (never reaches the API). */
function failingClient(): Client
{
    $handler = fn (RequestInterface $request, array $options): PromiseInterface
        => new RejectedPromise(new ConnectException('ECONNREFUSED', $request));

    $guzzle = new GuzzleClient(['handler' => $handler]);

    return MillionSend::client('ms_test', 'https://api.test', ['client' => $guzzle]);
}

/** Decoded JSON body of a recorded request (null when empty). */
function bodyOf(RequestInterface $request): mixed
{
    $raw = (string) $request->getBody();

    return $raw === '' ? null : json_decode($raw, true);
}
