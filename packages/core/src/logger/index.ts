import pino from 'pino';
import type { PostaConfig } from '../config/index';

/**
 * A GELF/Graylog destination for pino.
 * Mirrors the Graylog logging in lib/posta/config.rb.
 */
function createGelfStream(gelfConfig: NonNullable<PostaConfig['gelf']>) {
  const { host, port, facility } = gelfConfig;
  if (!host) return undefined;

  // Build GELF-compatible UDP message
  // Bun lacks Node's dgram, so we use fetch/UDP via OS or a simple TCP approach
  // For now, log via structured JSON that can be consumed by a log shipper
  return {
    write(rec: any) {
      const gelfMessage = {
        version: '1.1',
        host: facility,
        short_message: rec.msg ?? rec.message ?? '[no message]',
        full_message: JSON.stringify(rec),
        timestamp: Date.now() / 1000,
        level: rec.level ?? 6,
        _facility: facility,
        _service: 'posta',
      };
      // Write to stdout as structured JSON for now
      // In production, this would send UDP via dgram or HTTP to Graylog
      console.log(JSON.stringify({ type: 'gelf', ...gelfMessage }));
    },
  };
}

/**
 * Create a pino logger instance configured for Posta.
 *
 * Mirrors the Ruby logger in lib/posta.rb:
 * - stdout destination
 * - Optional GELF/Graylog output
 * - Configurable log level
 */
export function createLogger(config: PostaConfig, name?: string): pino.Logger {
  const level = config.logging?.level ?? 'info';

  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level,
    },
  ];

  const logger = pino({
    name: name ?? 'posta',
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  });

  // If GELF is configured, add a custom stream
  if (config.gelf?.host) {
    const gelfStream = createGelfStream(config.gelf);
    if (gelfStream) {
      // pino supports adding custom streams via multistream
      const multistream = pino.multistream([
        { stream: pino.destination(1) },
        { stream: gelfStream as any },
      ]);
      return pino({ name: name ?? 'posta', level }, multistream);
    }
  }

  return logger;
}

export type PostaLogger = pino.Logger;
