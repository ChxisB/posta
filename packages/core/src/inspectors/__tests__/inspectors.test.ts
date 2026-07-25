import { describe, it, expect } from 'bun:test';
import { checkWithRspamd } from '../rspamd';
import { scanWithClamav } from '../clamav';
import net from 'node:net';

// ---------------------------------------------------------------------------
// Rspamd tests
// ---------------------------------------------------------------------------

describe('checkWithRspamd', () => {
  let port: number;
  const rawMessage = `From: sender@example.com\r\nTo: rcpt@example.com\r\nSubject: Test\r\n\r\nHello.`;

  // --- Helper: start a fake Rspamd HTTP server ---
  async function startServer(
    handler: (req: Request) => Response | Promise<Response>,
  ): Promise<number> {
    const s = Bun.serve({
      port: 0,
      fetch: handler,
    });
    // Poll until port is assigned
    while (!s.port) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return s.port;
  }

  it('returns checks for successful rspamd response', async () => {
    port = await startServer(async (req) => {
      expect(req.method).toBe('POST');
      expect(new URL(req.url).pathname).toBe('/checkv2');
      expect(req.headers.get('User-Agent')).toBe('Posta');

      const body = await req.text();
      expect(body).toBe(rawMessage);

      return Response.json({
        symbols: {
          BAYES_SPAM: {
            name: 'BAYES_SPAM',
            score: 5.0,
            description: 'Message probably spam',
          },
          RCVD_VIA_SMTP_AUTH: {
            name: 'RCVD_VIA_SMTP_AUTH',
            score: -0.5,
            description: 'Received via authenticated SMTP',
          },
          EMPTY: {
            name: 'EMPTY',
            score: 0.1,
            description: '',
          },
        },
      });
    });

    const result = await checkWithRspamd(
      { host: '127.0.0.1', port },
      rawMessage,
      'incoming',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.error).toBeUndefined();
    expect(result.checks).toHaveLength(2); // EMPTY filtered out (blank description)
    expect(result.checks[0].name).toBe('BAYES_SPAM');
    expect(result.checks[0].score).toBe(5.0);
    expect(result.checks[0].description).toBe('Message probably spam');
  });

  it('sends outgoing headers when scope is outgoing', async () => {
    port = await startServer(async (req) => {
      expect(req.headers.get('User')).toBe('');
      expect(req.headers.get('Ip')).toBe('');
      return Response.json({ symbols: {} });
    });

    const result = await checkWithRspamd(
      { host: '127.0.0.1', port },
      rawMessage,
      'outgoing',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.error).toBeUndefined();
  });

  it('returns empty checks when symbols key is missing', async () => {
    port = await startServer(async () => Response.json({ not_symbols: 1 }));

    const result = await checkWithRspamd(
      { host: '127.0.0.1', port },
      rawMessage,
      'incoming',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.checks).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('returns error on non-200 response', async () => {
    port = await startServer(async () => new Response('Bad', { status: 500 }));

    const result = await checkWithRspamd(
      { host: '127.0.0.1', port },
      rawMessage,
      'incoming',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.error).toContain('got 500');
    expect(result.checks).toEqual([]);
  });

  it('sends password and flags headers when configured', async () => {
    port = await startServer(async (req) => {
      expect(req.headers.get('Password')).toBe('secret');
      expect(req.headers.get('Flags')).toBe('groups=10');
      return Response.json({ symbols: {} });
    });

    const result = await checkWithRspamd(
      { host: '127.0.0.1', port, password: 'secret', flags: 'groups=10' },
      rawMessage,
      'incoming',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.error).toBeUndefined();
  });

  it('handles connection refusal gracefully', async () => {
    // Use a port that is very likely closed
    const result = await checkWithRspamd(
      { host: '127.0.0.1', port: 19999 },
      rawMessage,
      'incoming',
      'rcpt@example.com',
      'sender@example.com',
      'abc123',
    );

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Error when scanning with rspamd');
    expect(result.checks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ClamAV tests
// ---------------------------------------------------------------------------

describe('scanWithClamav', () => {
  const rawMessage = `From: sender@example.com\r\nTo: rcpt@example.com\r\nSubject: Test\r\n\r\nHello.`;

  // --- Helper: start a fake ClamAV TCP server ---
  type TcpServerHandle = { port: number; close: () => Promise<void> };

  function startTcpServer(
    handler: (socket: net.Socket) => void,
  ): Promise<TcpServerHandle> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        handler(socket);
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          resolve({
            port: addr.port,
            close: () =>
              new Promise<void>((res) => {
                server.close(() => res());
              }),
          });
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      server.on('error', reject);
    });
  }

  /**
   * Parse the ClamAV INSTREAM protocol from a received buffer.
   * Returns true when a complete message (terminated by a zero-length chunk)
   * has been received, meaning we can send the response.
   */
  function isInstreamComplete(buf: Buffer): boolean {
    if (buf.length < 10) return false; // "zINSTREAM\0" = 10 bytes

    let offset = 10; // skip header

    while (offset + 4 <= buf.length) {
      const chunkLen = buf.readUInt32BE(offset);
      offset += 4;
      if (chunkLen === 0) return true; // null terminator found
      if (offset + chunkLen > buf.length) return false; // incomplete chunk
      offset += chunkLen;
    }

    return false;
  }

  it('returns no threat for stream: OK response', async () => {
    const server = await startTcpServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        // Once the INSTREAM terminator (zero-length chunk) is received,
        // the message is complete — send the response.
        if (isInstreamComplete(buf)) {
          socket.end('stream: OK\0');
        }
      });
    });

    try {
      const result = await scanWithClamav(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
      );

      expect(result.threat).toBe(false);
      expect(result.message).toBe('No threats found');
    } finally {
      await server.close();
    }
  });

  it('returns threat for virus detection response', async () => {
    const server = await startTcpServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        if (isInstreamComplete(buf)) {
          socket.end('stream: Eicar-Test-Signature FOUND\0');
        }
      });
    });

    try {
      const result = await scanWithClamav(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
      );

      expect(result.threat).toBe(true);
      expect(result.message).toBe('Eicar-Test-Signature');
    } finally {
      await server.close();
    }
  });

  it('handles unparseable response', async () => {
    const server = await startTcpServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        if (isInstreamComplete(buf)) {
          socket.end('garbage data without stream prefix');
        }
      });
    });

    try {
      const result = await scanWithClamav(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
      );

      expect(result.threat).toBe(false);
      expect(result.message).toBe('Could not scan message');
    } finally {
      await server.close();
    }
  });

  it('handles connection timeout', async () => {
    // Connect to a non-routable address that will timeout
    const result = await scanWithClamav(
      { host: '192.0.2.1', port: 3310 },
      rawMessage,
      1000, // short timeout
    );

    // Should either timeout or get an error, but not crash
    expect(result.threat).toBe(false);
    expect(
      result.message === 'Timed out scanning for threats' ||
        result.message === 'Error when scanning for threats',
    ).toBe(true);
  });

  it('handles connection refused gracefully', async () => {
    const result = await scanWithClamav(
      { host: '127.0.0.1', port: 19998 },
      rawMessage,
      2000,
    );

    expect(result.threat).toBe(false);
    expect(result.message).toBe('Error when scanning for threats');
  });
});
