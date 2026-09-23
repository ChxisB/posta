import { afterEach, describe, expect, it } from 'bun:test';
import net from 'node:net';
import { SmtpSender } from './index';

/**
 * How SmtpSender classifies what the receiving server says about a recipient.
 * The worker acts on this directly: Sent ends the message, SoftFail retries
 * it, and HardFail fails it and suppresses the address. Getting it wrong in
 * either direction loses mail or retries a dead address for days.
 */

interface Sink {
  port: number;
  connections: number;
  accepted: number;
  close(): Promise<void>;
}

/** A receiving server that answers every RCPT TO with `rcptReply`. */
function startSink(rcptReply: string): Promise<Sink> {
  const state = { port: 0, connections: 0, accepted: 0 } as Sink;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    state.connections++;
    let buffer = '';
    let inData = false;
    let rcptAccepted = false;

    socket.write('220 sink.test ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let out = '';
      let i: number;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            state.accepted++;
            out += '250 2.0.0 Ok: queued\r\n';
          }
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') out += '250-sink.test\r\n250 PIPELINING\r\n';
        else if (verb === 'RCPT') {
          rcptAccepted = rcptReply.startsWith('2');
          out += `${rcptReply}\r\n`;
        } else if (verb === 'DATA') {
          // What a real server says to DATA when every recipient was refused.
          if (rcptAccepted) {
            inData = true;
            out += '354 Go ahead\r\n';
          } else {
            out += '554 5.5.1 No valid recipients\r\n';
          }
        } else if (verb === 'QUIT') out += '221 Bye\r\n';
        else out += '250 Ok\r\n';
      }
      if (out) socket.write(out);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      state.port = typeof address === 'object' && address ? address.port : 0;
      state.close = () =>
        new Promise<void>((done) => {
          for (const socket of sockets) socket.destroy();
          server.close(() => done());
        });
      resolve(state);
    });
  });
}

const sinks: Sink[] = [];

async function sink(rcptReply: string): Promise<Sink> {
  const s = await startSink(rcptReply);
  sinks.push(s);
  return s;
}

/** A sender whose "MX hosts" are the given sinks, tried in order. */
function senderFor(...targets: Sink[]): SmtpSender {
  return new SmtpSender({
    heloHostname: 'posta.test',
    openTimeout: 5,
    readTimeout: 5,
    smtpRelays: targets.map((t) => ({ host: '127.0.0.1', port: t.port, ssl_mode: 'None' })),
  });
}

const MESSAGE = 'From: a@posta.test\r\nTo: b@remote.test\r\nSubject: x\r\n\r\nhello';

afterEach(async () => {
  await Promise.all(sinks.splice(0).map((s) => s.close()));
});

describe('SmtpSender classification', () => {
  it('reports an accepted message as Sent', async () => {
    const mx = await sink('250 2.1.5 Ok');
    const result = await senderFor(mx).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.classification).toBe('Sent');
    expect(mx.accepted).toBe(1);
  });

  it('treats a 4xx at RCPT as a soft fail, not a delivery', async () => {
    // The regression: anything below 500 was recorded as Sent, so a
    // greylisted or over-quota recipient lost the message with no retry.
    const mx = await sink('452 4.2.2 Mailbox full');
    const result = await senderFor(mx).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.success).toBe(false);
    expect(result.classification).toBe('SoftFail');
    expect(result.error).toBe('452 4.2.2 Mailbox full');
    expect(mx.accepted).toBe(0);
  });

  it('treats a 5xx at RCPT as a hard fail', async () => {
    // The regression: a 550 came back as SoftFail, so it was retried for days
    // and the address never reached the suppression list.
    const mx = await sink('550 5.1.1 No such user');
    const result = await senderFor(mx).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.classification).toBe('HardFail');
    expect(result.error).toBe('550 5.1.1 No such user');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].responseCode).toBe(550);
  });

  it('stops at the first permanent rejection instead of trying the next MX', async () => {
    const first = await sink('550 5.1.1 No such user');
    const second = await sink('250 2.1.5 Ok');
    const result = await senderFor(first, second).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.classification).toBe('HardFail');
    expect(second.connections).toBe(0);
  });

  it('moves on to the next MX after a deferral', async () => {
    const first = await sink('451 4.7.1 Try again later');
    const second = await sink('250 2.1.5 Ok');
    const result = await senderFor(first, second).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.classification).toBe('Sent');
    expect(second.accepted).toBe(1);
  });

  it('keeps every attempt when all servers defer', async () => {
    const first = await sink('451 4.7.1 Try again later');
    const second = await sink('421 4.3.2 Shutting down');
    const result = await senderFor(first, second).send(MESSAGE, 'a@posta.test', 'b@remote.test');

    expect(result.classification).toBe('SoftFail');
    expect(result.attempts.map((a) => a.responseCode)).toEqual([451, 421]);
    expect(result.error).toBe('421 4.3.2 Shutting down');
  });
});
