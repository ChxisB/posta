# @posta/i18n

One catalog, three renderers: the dashboard, Posta's own transactional emails, and the
hosted unsubscribe/preferences pages all read from `messages/` (ICU MessageFormat, consumed
via next-intl).

## Rules

- **No user-facing string literals outside `messages/`**: anywhere, from the first commit.
- `en` is the source of truth, and the only language Posta ships. Adding one is an entry in
  `src/locales.ts` and a folder of messages that carries the same keys as `en`.
- The public REST API is deliberately NOT localized: stable machine-readable error codes with
  English messages (programs parse codes; humans read docs).
- Recipient-facing pages (unsubscribe/preferences) resolve locale from `Accept-Language`:
  the visitor is the recipient, not our customer.
