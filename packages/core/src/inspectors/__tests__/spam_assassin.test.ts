import { describe, it, expect } from 'bun:test';
import { checkWithSpamAssassin } from '../spam_assassin';

describe('checkWithSpamAssassin', () => {
  const rawMessage = `From: sender@example.com\r\nTo: rcpt@example.com\r\nSubject: Test\r\n\r\nHello.`;

  type TcpServerHandle = { port: number; close: () => Promise<void> };

  function startTcpServer(
    handler: (data: string) => string,
  ): Promise<TcpServerHandle> {
    return new Promise((resolve) => {
      const server = Bun.listen({
        hostname: '127.0.0.1',
        port: 0,
        socket: {
          data(socket, data: Buffer) {
            const response = handler(data.toString());
            if (response) socket.write(response);
            socket.end();
          },
          open(_socket) {},
          close(_socket) {},
          drain(_socket) {},
        },
      });
      resolve({
        port: (server as any).port,
        close: () => { server.stop(); return Promise.resolve(); },
      });
    });
  }

  function buildSpamcResponse(
    spam: boolean,
    score: number,
    threshold: number,
    rules: Array<{ score: number; name: string; description: string }>,
  ): string {
    const spamStr = spam ? 'True' : 'False';
    const headers = [
      `SPAMC/1.2 200 OK`,
      `Spam: ${spamStr} ; ${score.toFixed(1)} / ${threshold.toFixed(1)}`,
      `Content-length: 0`,
      '',
      '',
    ].join('\r\n');

    const separator = '--- -------------------------------------------------- ---\r\n';
    const ruleLines = rules
      .map((r) => ` ${r.score.toFixed(1).padStart(5)} ${r.name.padEnd(22)} ${r.description}`)
      .join('\r\n');

    return headers + separator + ruleLines + '\r\n';
  }

  it('parses a spam response with multiple rules', async () => {
    const server = await startTcpServer(() =>
      buildSpamcResponse(true, 12.5, 5.0, [
        { score: 5.0, name: 'BAYES_99', description: 'Bayes spam probability is high' },
        { score: 3.5, name: 'RCVD_IN_BL', description: 'Received via a relay in blocklist' },
        { score: 2.0, name: 'MISSING_SUBJECT', description: 'Missing Subject header' },
        { score: 2.0, name: 'EMPTY_MESSAGE', description: 'Message appears to be empty' },
      ]),
    );

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'incoming',
      );

      expect(result.spam).toBe(true);
      expect(result.score).toBe(12.5);
      expect(result.threshold).toBe(5.0);
      expect(result.checks).toHaveLength(4);
      expect(result.checks[0].name).toBe('BAYES_99');
      expect(result.checks[0].score).toBe(5.0);
      expect(result.checks[0].description).toBe('Bayes spam probability is high');
      expect(result.error).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it('parses a non-spam response', async () => {
    const server = await startTcpServer(() =>
      buildSpamcResponse(false, 1.2, 5.0, [
        { score: 0.5, name: 'NO_RELAYS', description: 'Informational: message was not relayed via SMTP' },
        { score: 0.7, name: 'MISSING_DATE', description: 'Missing Date header' },
      ]),
    );

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'incoming',
      );

      expect(result.spam).toBe(false);
      expect(result.score).toBe(1.2);
      expect(result.threshold).toBe(5.0);
      expect(result.checks).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('filters out excluded rules for outgoing scope', async () => {
    const server = await startTcpServer(() =>
      buildSpamcResponse(false, 3.0, 5.0, [
        { score: 1.0, name: 'NO_RECEIVED', description: 'No Received headers' },
        { score: 0.5, name: 'SPF_FAIL', description: 'SPF check failed' },
        { score: 0.5, name: 'HELO_DYNAMIC', description: 'HELO is dynamic' },
        { score: 0.5, name: 'DKIM_INVALID', description: 'DKIM signature invalid' },
        { score: 0.5, name: 'RCVD_IN_PBL', description: 'Received in PBL' },
        { score: 0.5, name: 'BAYES_50', description: 'Bayes neutral' },
        { score: 0.5, name: 'MISSING_SUBJECT', description: 'Missing Subject' },
      ]),
    );

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'outgoing',
      );

      const excludedNames = ['NO_RECEIVED', 'SPF_FAIL', 'HELO_DYNAMIC', 'DKIM_INVALID', 'RCVD_IN_PBL'];
      for (const name of excludedNames) {
        expect(result.checks.find((c) => c.name === name)).toBeUndefined();
      }
      expect(result.checks).toHaveLength(2);
      expect(result.checks.find((c) => c.name === 'BAYES_50')).toBeDefined();
      expect(result.checks.find((c) => c.name === 'MISSING_SUBJECT')).toBeDefined();
    } finally {
      await server.close();
    }
  });

  it('does not filter exclusions for incoming scope', async () => {
    const server = await startTcpServer(() =>
      buildSpamcResponse(false, 3.0, 5.0, [
        { score: 1.0, name: 'NO_RECEIVED', description: 'No Received headers' },
        { score: 0.5, name: 'SPF_FAIL', description: 'SPF check failed' },
      ]),
    );

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'incoming',
      );

      expect(result.checks).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it('handles connection refusal gracefully', async () => {
    const result = await checkWithSpamAssassin(
      { host: '127.0.0.1', port: 1 },
      rawMessage,
      'incoming',
    );

    expect(result.spam).toBe(false);
    expect(result.score).toBe(0);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('ERROR');
    expect(result.error).toBeDefined();
  });

  it('handles timeout gracefully', async () => {
    // Create a TCP server that holds the connection open without responding.
    const holdServer = Bun.listen({
      hostname: '127.0.0.1', port: 0,
      socket: {
        data(_s, _d) { /* accept but never respond */ },
        open(_s) {},
        close(_s) {},
        drain(_s) {},
      },
    });

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: (holdServer as any).port },
        rawMessage,
        'incoming',
        500,
      );

      expect(result.spam).toBe(false);
      expect(result.score).toBe(0);
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].name).toBe('TIMEOUT');
      expect(result.error).toBeDefined();
    } finally {
      holdServer.stop();
    }
  });

  it('handles empty response gracefully', async () => {
    const server = await startTcpServer(() => '');

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'incoming',
      );

      expect(result.spam).toBe(false);
      expect(result.score).toBe(0);
      expect(result.checks).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('handles continuation lines in rule descriptions', async () => {
    const server = await startTcpServer(() => {
      const headers = [
        'SPAMC/1.2 200 OK',
        'Spam: False ; 0.0 / 5.0',
        '',
        '',
      ].join('\r\n');
      const separator = '--- -------------------------------------------------- ---\r\n';
      const ruleLines = [
        '  0.5 RCVD_IN_BL        Received via a relay in blocklist',
        '  0.2 MISSING_SUBJECT   Missing Subject header',
      ].join('\r\n');
      return headers + separator + ruleLines + '\r\n';
    });

    try {
      const result = await checkWithSpamAssassin(
        { host: '127.0.0.1', port: server.port },
        rawMessage,
        'incoming',
      );

      expect(result.checks).toHaveLength(2);
      expect(result.checks[0].name).toBe('RCVD_IN_BL');
      expect(result.checks[0].score).toBe(0.5);
      expect(result.checks[1].name).toBe('MISSING_SUBJECT');
    } finally {
      await server.close();
    }
  });
});
