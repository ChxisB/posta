/**
 * SSL modes for outbound SMTP connections.
 */
export const SSLModes = {
  AUTO: 'Auto',
  STARTTLS: 'STARTTLS',
  TLS: 'TLS',
  NONE: 'None',
} as const;

export type SSLModesType = (typeof SSLModes)[keyof typeof SSLModes];
