import { afterEach, describe, expect, it } from 'bun:test';
import net from 'node:net';
import { SmtpSession } from './session';

/**
 * The outbound SMTP dialog, against a real peer on loopback.
 *
 * The sink is defined here rather than imported from @posta/bench: a test
 * reaching across a package boundary falls outside this package's rootDir,
 * which breaks `tsc`.
 */

interface Sink {
  port: number;
  accepted: number;
  deferred: number;
  connections: number;
  /** Everything received inside DATA, so the body can be asserted on. */
  lastBody: string;
  close(): Promise<void>;
}

function startSink(options: { defer?: boolean } = {}): Promise<Sink> {
  const state = {
    port: 0,
    accepted: 0,
    deferred: 0,
    connections: 0,
    lastBody: '',
  } as Sink;

  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    state.connections++;
    socket.setNoDelay(true);
    let inData = false;
    let body: string[] = [];
    let buffer = '';

    socket.write('220 sink.test ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let out = '';
      let i: number;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);

        if (inData) {
          if (line !== '.') {
            body.push(line);
            continue;
          }
          inData = false;
          state.lastBody = body.join('\r\n');
          body = [];
          if (options.defer) {
            state.deferred++;
            out += '451 4.7.1 Deferred\r\n';
          } else {
            state.accepted++;
            out += `250 2.0.0 Ok: queued as ${state.accepted}\r\n`;
          }
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') out += '250-sink.test\r\n250-PIPELINING\r\n250 8BITMIME\r\n';
        else if (verb === 'DATA') {
          inData = true;
          out += '354 End data with <CR><LF>.<CR><LF>\r\n';
        } else if (verb === 'QUIT') out += '221 2.0.0 Bye\r\n';
        else out += '250 2.0.0 Ok\r\n';
      }
      if (out) socket.write(out);
    });

    socket.on('error', () => socket.destroy());
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      state.port = typeof address === 'object' && address ? address.port : 0;
      // Destroy live connections before closing. server.close() only fires
      // its callback once every connection has ended, and the client here
      // never disconnects — so without this the teardown hangs and bun
      // reports it as a timeout against the test that just passed.
      state.close = () =>
        new Promise<void>((done) => {
          for (const socket of sockets) socket.destroy();
          server.close(() => done());
        });
      resolve(state);
    });
  });
}

const HEADERS = ['From: a@test', 'To: b@test', 'Subject: x', ''].join('\r\n');

let sink: Sink | undefined;

async function session(defer = false): Promise<SmtpSession> {
  sink = await startSink({ defer });
  const s = new SmtpSession({
    host: '127.0.0.1',
    port: sink.port,
    sslMode: 'None',
    heloHostname: 'client.test',
  });
  await s.connect();
  await s.ehlo();
  return s;
}

/** One full message through the sequential path. */
async function send(s: SmtpSession, to: string, raw: string) {
  await s.mailFrom('a@test');
  await s.rcptTo(to);
  return s.data(raw);
}

afterEach(async () => {
  await sink?.close();
  sink = undefined;
});

describe('sending a message body', () => {
  it('delivers a simple message', async () => {
    const s = await session();
    const response = await send(s, 'b@test', `${HEADERS}\r\nhello`);
    expect(response.code).toBe(250);
    expect(sink!.accepted).toBe(1);
  });

  it('transmits the body byte-for-byte', async () => {
    const s = await session();
    await send(s, 'b@test', `${HEADERS}\r\nline one\r\nline two`);
    expect(sink!.lastBody).toContain('line one\r\nline two');
  });

  it('handles a large body in one write', async () => {
    // The regression this guards: the body used to be written a line at a
    // time with a separate await each, so a 500-line message cost 1000
    // socket writes and let the network stack interleave small packets.
    const s = await session();
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    const response = await send(s, 'b@test', `${HEADERS}\r\n${lines.join('\r\n')}`);

    expect(response.code).toBe(250);
    expect(sink!.lastBody).toContain('line 0');
    expect(sink!.lastBody).toContain('line 499');
  });

  it('dot-stuffs a line that would otherwise end the message', async () => {
    // A leading dot is the end-of-data marker. Without stuffing, the message
    // is truncated there and the remainder is parsed as SMTP commands.
    const s = await session();
    await send(s, 'b@test', `${HEADERS}\r\n.hidden\r\nafter`);

    // The sink strips the stuffing, so the original line comes back intact
    // and the text after it survives rather than being eaten as commands.
    expect(sink!.lastBody).toContain('.hidden');
    expect(sink!.lastBody).toContain('after');
    expect(sink!.accepted).toBe(1);
  });

  it('leaves the connection usable for the next message', async () => {
    // A mis-stuffed or mis-terminated body desynchronises the connection, and
    // the failure only shows on the *following* message.
    const s = await session();
    await send(s, 'b@test', `${HEADERS}\r\n.dotted`);
    const second = await send(s, 'c@test', `${HEADERS}\r\nplain`);

    expect(second.code).toBe(250);
    expect(sink!.accepted).toBe(2);
    expect(sink!.connections).toBe(1);
  });

  it('preserves an empty line between headers and body', async () => {
    // Lose it and every recipient sees the headers as body text.
    const s = await session();
    await send(s, 'b@test', `${HEADERS}\r\nbody text`);
    expect(sink!.lastBody).toContain('Subject: x\r\n\r\nbody text');
  });
});

describe('deferrals', () => {
  it('surfaces a 4xx rather than reporting success', async () => {
    const s = await session(true);
    const response = await send(s, 'b@test', `${HEADERS}\r\nhello`);
    expect(response.code).toBe(451);
    expect(sink!.deferred).toBe(1);
  });
});

describe('pipelined transaction', () => {
  it('detects PIPELINING from the EHLO capabilities', async () => {
    expect((await session()).supportsPipelining).toBe(true);
  });

  it('delivers a message and reports it pipelined', async () => {
    const s = await session();
    const { response, pipelined } = await s.transaction('a@test', 'b@test', `${HEADERS}\r\nhello`);
    expect(pipelined).toBe(true);
    expect(response.code).toBe(250);
  });

  it('stays in sync across several messages on one connection', async () => {
    // The desync this guards: a reply left unread surfaces as the *second*
    // message receiving the first one's response.
    const s = await session();
    for (let i = 0; i < 5; i++) {
      const { response } = await s.transaction('a@test', `b${i}@test`, `${HEADERS}\r\nmsg ${i}`);
      expect(response.code).toBe(250);
    }
    expect(sink!.accepted).toBe(5);
    expect(sink!.connections).toBe(1);
  });

  it('transmits the body intact when pipelined', async () => {
    const s = await session();
    await s.transaction('a@test', 'b@test', `${HEADERS}\r\n.dotted\r\nafter`);
    expect(sink!.lastBody).toContain('.dotted');
    expect(sink!.lastBody).toContain('after');
  });

  it('surfaces a deferral without desyncing the connection', async () => {
    const s = await session(true);
    expect((await s.transaction('a@test', 'b@test', `${HEADERS}\r\nx`)).response.code).toBe(451);
    // Still usable: a 4xx must not leave replies unread.
    expect((await s.transaction('a@test', 'c@test', `${HEADERS}\r\ny`)).response.code).toBe(451);
    expect(sink!.deferred).toBe(2);
  });
});
