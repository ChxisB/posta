export { checkWithRspamd } from './rspamd';
export type { SpamCheck, RspamdConfig } from './rspamd';

export { scanWithClamav } from './clamav';
export type { ClamavConfig, ClamavResult } from './clamav';

export { checkWithSpamAssassin } from './spam_assassin';
export type { SpamAssassinConfig, SpamAssassinCheck, SpamAssassinResult } from './spam_assassin';
