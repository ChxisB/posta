<?php

declare(strict_types=1);

use MillionSend\Exceptions\ErrorException;
use MillionSend\MillionSend;

/**
 * End-to-end smoke test against a real MillionSend instance. Opt-in: set
 * MILLIONSEND_API_KEY (a full-access key) and, for a self-hosted instance,
 * MILLIONSEND_BASE_URL (the default is MillionSend Cloud). It exercises the
 * contact lifecycle, which needs no verified domain. Skipped entirely when the
 * key is absent.
 *
 *   MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 \
 *     ./vendor/bin/pest --group=e2e
 */
$skip = fn (): bool => getenv('MILLIONSEND_API_KEY') === false;

it('creates, reads, updates and deletes a contact', function () {
    $ms = MillionSend::client();
    $email = 'sdk-e2e-' . uniqid() . '@example.com';

    $created = $ms->contacts->create(['email' => $email, 'firstName' => 'Ada']);
    expect($created['id'])->not->toBeEmpty();

    $fetched = $ms->contacts->get(['email' => $email]);
    expect($fetched['email'])->toBe($email);
    expect($fetched['first_name'])->toBe('Ada');

    $ms->contacts->update(['email' => $email, 'unsubscribed' => true]);

    $removed = $ms->contacts->remove(['email' => $email]);
    expect($removed['deleted'])->toBeTrue();
})->group('e2e')->skip($skip, 'Set MILLIONSEND_API_KEY to run the e2e suite.');

it('throws a not_found ErrorException for a missing contact', function () {
    $ms = MillionSend::client();

    try {
        $ms->contacts->get(['email' => 'does-not-exist@example.com']);
        $this->fail('expected a not_found ErrorException');
    } catch (ErrorException $e) {
        expect($e->getErrorName())->toBe('not_found');
    }
})->group('e2e')->skip($skip, 'Set MILLIONSEND_API_KEY to run the e2e suite.');
