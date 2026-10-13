<?php

declare(strict_types=1);

namespace MillionSend;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use MillionSend\Exceptions\ErrorException;

/**
 * Thin wrapper over Guzzle: adds auth/User-Agent, maps a non-2xx response to an
 * {@see ErrorException}, and a transport failure to the same with a null status.
 */
final class HttpClient
{
    public const VERSION = '0.8.0';

    private readonly string $baseUrl;
    private readonly string $userAgent;
    private readonly ClientInterface $http;

    public function __construct(
        private readonly string $apiKey,
        ?string $baseUrl = null,
        ?ClientInterface $http = null,
        ?string $userAgent = null,
        private readonly float $timeout = 30.0,
        private readonly float $connectTimeout = 10.0,
        bool $allowInsecureHttp = false,
    ) {
        if ($this->timeout <= 0 || $this->connectTimeout <= 0) {
            throw new \InvalidArgumentException('HTTP timeouts must be greater than zero.');
        }
        $resolved = $baseUrl ?? (getenv('MILLIONSEND_BASE_URL') ?: null) ?? 'https://api.millionsend.com';
        $this->baseUrl = rtrim($resolved, '/');
        // The API key travels as a bearer header, so plain http is loopback-only by default.
        if (!$allowInsecureHttp && Util::isInsecureHttpUrl($this->baseUrl)) {
            throw new \InvalidArgumentException(
                "Refusing to send the API key over plain http to {$this->baseUrl}. "
                . "Use https, or pass ['allowInsecureHttp' => true]."
            );
        }
        $this->http = $http ?? new GuzzleClient();
        $base = 'millionsend-php/' . self::VERSION;
        $this->userAgent = $userAgent !== null ? "{$base} {$userAgent}" : $base;
    }

    /**
     * Keeps the API key out of var_dump/print_r output.
     *
     * @return array<string,string>
     */
    public function __debugInfo(): array
    {
        return ['baseUrl' => $this->baseUrl, 'userAgent' => $this->userAgent];
    }

    /**
     * @param array<mixed>|object|null $body    Object bodies encode as JSON objects; list arrays stay JSON arrays.
     * @param array<string,scalar>     $query
     * @param array<string,string>     $headers Extra per-request headers (see {@see Util::optionHeaders()}).
     * @return array<mixed>
     * @throws ErrorException
     */
    public function request(
        string $method,
        string $path,
        array|object|null $body = null,
        array $query = [],
        ?string $idempotencyKey = null,
        array $headers = [],
    ): array {
        $headers = [
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Accept' => 'application/json',
            'User-Agent' => $this->userAgent,
            ...$headers,
        ];
        // Idempotency is POST-only on the wire; sending it elsewhere is a no-op.
        if ($idempotencyKey !== null && $method === 'POST') {
            $headers['Idempotency-Key'] = $idempotencyKey;
        }

        $options = [
            'headers' => $headers,
            'http_errors' => false,
            'timeout' => $this->timeout,
            'connect_timeout' => $this->connectTimeout,
        ];
        if ($query !== []) {
            $options['query'] = $query;
        }
        if ($body !== null) {
            $options['json'] = $body;
        }

        try {
            $response = $this->http->request($method, $this->baseUrl . $path, $options);
        } catch (GuzzleException $e) {
            throw new ErrorException('application_error', $e->getMessage(), null);
        }

        $status = $response->getStatusCode();
        $raw = (string) $response->getBody();
        $decoded = $raw === '' ? null : json_decode($raw, true);

        if ($status < 200 || $status >= 300) {
            throw ErrorException::fromBody($decoded, $status);
        }

        return is_array($decoded) ? $decoded : [];
    }
}
