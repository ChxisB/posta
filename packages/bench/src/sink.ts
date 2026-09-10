import net from 'node:net';

/**
 * A deliberately stupid SMTP sink: accept everything, remember nothing.
 *
 * Every delivery benchmark needs somewhere to send to, and it must not be a
 * real mailbox provider. Benchmarking against Gmail measures Gmail, gets the
 * sending IPs blocked, and cannot be run in CI. It also cannot be attributed:
 * a slow result tells you nothing about whether the fault is yours.
 *
 * This exists to be *not the bottleneck*. It does no parsing beyond finding
 * the end of DATA, allocates nothing per message beyond a counter, and never
 * touches disk. If the sink ever appears in the latency profile the numbers
 * are meaningless, so `stats()` exposes its own service time for exactly
 * that check.
 *
 * `latencyMs` deliberately slows it down. A sink that answers instantly is
 * unrealistic: real MTAs cost 100-200ms of round trips, and a pipeline tuned
 * against a zero-latency peer will make the wrong trade-offs about
 * connection reuse and concurrency.
 */
export interface SinkOptions {
  port?: number;
  host?: string;
  /** Artificial per-command delay, to imitate a real MTA's round trips. */
  latencyMs?: number;
  /** Reject this fraction of messages with a 4xx, to exercise retry paths. */
  deferRate?: number;
  /**
   * Called with the value of the X-Bench-Id header when a message is
   * accepted, so an end-to-end run can correlate an arrival with the enqueue
   * that caused it. Delivery is not FIFO once retries are involved, so
   * matching arrivals to sends by order would quietly mis-attribute latency.
   */
  onMessage?: (benchId: string | null, at: number) => void;
}

export interface SinkStats {
  connections: number;
  messagesAccepted: number;
  messagesDeferred: number;
  /** Messages per connection: the number connection pooling has to move. */
  reuseRatio: number;
  /** Sink-side service time. If this is not ~0, the benchmark is invalid. */
  maxServiceMs: number;
}

export interface Sink {
  port: number;
  stats(): SinkStats;
  close(): Promise<void>;
}

export function startSink(options: SinkOptions = {}): Promise<Sink> {
  const { host = '127.0.0.1', latencyMs = 0, deferRate = 0, onMessage } = options;

  let connections = 0;
  let messagesAccepted = 0;
  let messagesDeferred = 0;
  let maxServiceMs = 0;

  const pause = latencyMs > 0 ? () => new Promise((r) => setTimeout(r, latencyMs)) : null;

  const server = net.createServer((socket) => {
    connections++;
    socket.setNoDelay(true);

    // Per-connection state. `inData` is the only parsing this does: while
    // inside DATA every line is body until a lone dot.
    let inData = false;
    let buffer = '';
    // Only the correlation header is retained from the body; everything else
    // is discarded unread, so the sink stays out of the latency profile.
    let benchId: string | null = null;

    // Replies are batched per inbound flight, then written together after a
    // single delay.
    //
    // `latencyMs` models network round-trip time, not per-command processing.
    // Charging it once per reply would make PIPELINING unmeasurable by
    // construction: a client that sends MAIL+RCPT+DATA in one packet would
    // still wait 3 x latency for the answers, which is exactly what
    // pipelining exists to avoid. Real MTAs answer a pipelined flight in one
    // round trip, so the delay belongs to the flight.
    let pending: string[] = [];
    const say = (line: string) => pending.push(line);

    let flushChain: Promise<void> = Promise.resolve();
    const flush = () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      flushChain = flushChain.then(async () => {
        const startedAt = performance.now();
        if (pause) await pause();
        socket.write(batch.map((l) => `${l}\r\n`).join(''));
        const service = performance.now() - startedAt - latencyMs;
        if (service > maxServiceMs) maxServiceMs = service;
      });
    };

    say('220 sink.posta.test ESMTP ready');
    flush();

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');

      // Process whole lines only. SMTP is line-oriented and a TCP chunk can
      // split one; without this, a body whose "\r\n.\r\n" straddles two reads
      // would be missed and the connection would hang.
      let index: number;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line !== '.' && benchId === null && line.startsWith('X-Bench-Id:')) {
            benchId = line.slice('X-Bench-Id:'.length).trim();
          }
          if (line === '.') {
            inData = false;
            if (deferRate > 0 && Math.random() < deferRate) {
              messagesDeferred++;
              say('451 4.7.1 Deferred by sink, try again later');
            } else {
              messagesAccepted++;
              // Timestamped here, at the moment of acceptance, rather than
              // after the reply is flushed: the artificial RTT delay is not
              // part of what is being measured.
              onMessage?.(benchId, performance.now());
              say(`250 2.0.0 Ok: queued as ${messagesAccepted}`);
            }
            benchId = null;
          }
          // Body lines are discarded without inspection, on purpose.
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        switch (verb) {
          case 'EHLO':
            // Advertise PIPELINING: the client should be batching commands,
            // and if it is not, that shows up as extra round trips.
            say('250-sink.posta.test\r\n250-PIPELINING\r\n250-8BITMIME\r\n250 SMTPUTF8');
            break;
          case 'DATA':
            inData = true;
            say('354 End data with <CR><LF>.<CR><LF>');
            break;
          case 'QUIT':
            say('221 2.0.0 Bye');
            socket.end();
            break;
          // HELO, MAIL, RCPT, RSET, NOOP and anything else: accept and move on.
          default:
            say('250 2.0.0 Ok');
        }
      }

      // One flight in, one flight out.
      flush();
    });

    socket.on('error', () => socket.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        stats: () => ({
          connections,
          messagesAccepted,
          messagesDeferred,
          reuseRatio: connections === 0 ? 0 : (messagesAccepted + messagesDeferred) / connections,
          maxServiceMs,
        }),
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

// Run standalone: `bun run sink`
if (import.meta.main) {
  const port = Number(process.env.SINK_PORT ?? 2525);
  const latencyMs = Number(process.env.SINK_LATENCY_MS ?? 0);
  const deferRate = Number(process.env.SINK_DEFER_RATE ?? 0);

  const sink = await startSink({ port, latencyMs, deferRate });
  console.log(`[sink] listening on :${sink.port}  latency=${latencyMs}ms  deferRate=${deferRate}`);

  const report = setInterval(() => {
    const s = sink.stats();
    console.log(
      `[sink] conns=${s.connections} accepted=${s.messagesAccepted} deferred=${s.messagesDeferred} ` +
        `msgs/conn=${s.reuseRatio.toFixed(1)} maxService=${s.maxServiceMs.toFixed(2)}ms`,
    );
  }, 5000);

  const shutdown = async () => {
    clearInterval(report);
    await sink.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
