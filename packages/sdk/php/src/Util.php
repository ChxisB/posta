<?php

declare(strict_types=1);

namespace MillionSend;

/** Shared mapping helpers used across resources. */
final class Util
{
    /**
     * Copy every key of $input onto the wire, renaming the camelCase aliases
     * listed in $aliases (camelCase => snake_case) and passing everything else
     * through untouched. Explicit nulls survive, so a contact update can send
     * `first_name: null` to clear a field, while keys absent from the input stay
     * off the wire entirely. A verbatim snake_case payload therefore works as-is.
     *
     * @param array<string,mixed>  $input
     * @param array<string,string> $aliases
     * @return array<string,mixed>
     */
    public static function rename(array $input, array $aliases): array
    {
        $out = [];
        foreach ($input as $key => $value) {
            $out[$aliases[$key] ?? $key] = $value;
        }

        return $out;
    }

    /**
     * {@see rename()} for a JSON-object body: an empty input encodes as `{}`
     * rather than `[]`.
     *
     * @param array<string,mixed>  $input
     * @param array<string,string> $aliases
     * @return array<string,mixed>|\stdClass
     */
    public static function body(array $input, array $aliases = []): array|\stdClass
    {
        return self::rename($input, $aliases) ?: new \stdClass();
    }

    /**
     * Per-request headers from an options array, accepting both this SDK's
     * camelCase option names and resend-php's snake_case ones.
     *
     * @param array<string,mixed> $options
     * @return array<string,string>
     */
    public static function optionHeaders(array $options): array
    {
        $headers = [];
        $key = $options['idempotencyKey'] ?? $options['idempotency_key'] ?? null;
        if ($key !== null) {
            $headers['Idempotency-Key'] = (string) $key;
        }
        $validation = $options['batchValidation'] ?? $options['batch_validation'] ?? null;
        if ($validation !== null) {
            $headers['x-batch-validation'] = (string) $validation;
        }

        return $headers;
    }

    private const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

    /** True for an http:// URL whose host is not loopback. Unparseable URLs are left to the transport. */
    public static function isInsecureHttpUrl(string $url): bool
    {
        $parts = parse_url($url);
        if ($parts === false || strtolower($parts['scheme'] ?? '') !== 'http') {
            return false;
        }
        $host = strtolower($parts['host'] ?? '');

        return !in_array($host, self::LOOPBACK_HOSTS, true) && !str_starts_with($host, '127.');
    }

    /**
     * Keyset list params (limit/after/before, plus any $extra filter keys),
     * dropping any that are unset.
     *
     * @param array<string,mixed> $options
     * @param list<string>        $extra
     * @return array<string,scalar>
     */
    public static function listQuery(array $options, array $extra = []): array
    {
        $out = [];
        foreach ([...['limit', 'after', 'before'], ...$extra] as $key) {
            if (isset($options[$key])) {
                $out[$key] = $options[$key];
            }
        }

        return $out;
    }
}
