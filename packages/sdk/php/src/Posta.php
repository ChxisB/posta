<?php

declare(strict_types=1);

namespace Posta;

use GuzzleHttp\ClientInterface;

/**
 * Static factory for the Posta {@see Client}.
 *
 * ```php
 * use Posta\Posta;
 *
 * $ms = Posta::client('po_123');                            // Posta Cloud
 * $ms = Posta::client('po_123', 'https://mail.acme.dev');  // self-hosted
 * $sent = $ms->emails->send([
 *     'from' => 'Acme <onboarding@acme.dev>',
 *     'to' => 'success@simulator.amazonses.com',
 *     'subject' => 'Hello',
 *     'html' => '<strong>it works</strong>',
 * ]);
 * ```
 */
final class Posta
{
    /**
     * @param string|null $apiKey  Falls back to env POSTA_API_KEY. Missing → throws.
     * @param string|null $baseUrl Falls back to env POSTA_BASE_URL, then Posta Cloud (https://api.posta.example).
     * @param array{client?: ClientInterface, userAgent?: string, timeout?: float, connectTimeout?: float, allowInsecureHttp?: bool} $options
     *        `client` injects a Guzzle client (tests, proxies); timeouts are seconds;
     *        `allowInsecureHttp` accepts a non-loopback http:// base URL (refused by default).
     */
    public static function client(?string $apiKey = null, ?string $baseUrl = null, array $options = []): Client
    {
        $key = $apiKey ?? (getenv('POSTA_API_KEY') ?: null);
        if ($key === null || $key === '') {
            throw new \InvalidArgumentException(
                'Missing API key. Pass it to Posta::client($apiKey) or set POSTA_API_KEY.'
            );
        }

        $http = new HttpClient(
            $key,
            $baseUrl,
            $options['client'] ?? null,
            $options['userAgent'] ?? null,
            $options['timeout'] ?? 30.0,
            $options['connectTimeout'] ?? 10.0,
            $options['allowInsecureHttp'] ?? false,
        );

        return new Client($http);
    }
}
