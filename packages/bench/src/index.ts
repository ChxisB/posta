import net from 'node:net';
import { startSink } from './sink';
import { Recorder, formatReport, meetsGate, SPIKE_GATE } from './percentiles';

/**
 * The delivery benchmark.
 *
 * Answers one question at a time, with stage attribution, so an improvement
 * can be traced to the stage it came from rather than inferred from a single
 * total that moved.
 *
 * The load is **open-loop**: sends are scheduled at fixed instants and fired
 * whether or not earlier ones have finished. A closed-loop harness — send,
 * wait, send again — throttles itself exactly when the system under test
 * slows down, so it never measures the queueing delay a real caller would
 * hit. That is the difference between a p99 that means something and one
 * that flatters you. See `Recorder.record`.
 */

interface Options {
  rate: number;
  durationSec: number;
  pool: boolean;
  pipeline: boolean;
  sinkLatencyMs: number;
  deferRate: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : Number(argv[i + 1]);
  };
  return {
    rate: get('--rate', 400),
    durationSec: get('--duration', 20),
    // Pooling is the thing under test, so it is opt-out rather than default.
    pool: !argv.includes('--no-pool'),
    pipeline: !argv.includes('--no-pipeline'),
    sinkLatencyMs: get('--sink-latency', 40),
    deferRate: get('--defer-rate', 0),
    concurrency: get('--concurrency', 32),
  };
}

/** One SMTP connection, reused across messages when pooling is on. */
class Connection {
  private socket: net.Socket | null = null;
  private buffer = '';
  /** FIFO: with pipelining several replies are outstanding at once. */
  private waiters: Array<(line: string) => void> = [];
  private pipelining = false;
  private lastBlock = '';
  messagesSent = 0;

  constructor(
    private host: string,
    private port: number,
    private allowPipelining = true,
  ) {}

  get isOpen(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Returns time spent on TCP setup plus greeting and EHLO, in ms. */
  async connect(): Promise<number> {
    const startedAt = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setNoDelay(true);
      socket.once('error', reject);
      socket.once('connect', () => {
        this.socket = socket;
        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('error', () => this.destroy());
        resolve();
      });
    });
    await this.expect(); // 220 greeting
    const ehlo = await this.command('EHLO bench.posta.test');
    // The sink sends its capability list as one write, so the whole block
    // lands in the buffer before the final "250 " line resolves this.
    this.pipelining =
      this.allowPipelining &&
      (ehlo.includes('PIPELINING') || this.lastBlock.includes('PIPELINING'));
    return performance.now() - startedAt;
  }

  private onData(chunk: Buffer | string): void {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('latin1');
    this.lastBlock = this.buffer;
    // A multi-line reply ends with "NNN " (space, not hyphen) on its last
    // line. Resolving on the first line would desynchronise the dialog
    // against the sink's multi-line EHLO.
    let index: number;
    while ((index = this.buffer.indexOf('\r\n')) !== -1) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      if (/^\d{3} /.test(line)) {
        const w = this.waiters.shift();
        if (w) w(line);
      }
    }
  }

  private expect(): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private async command(line: string): Promise<string> {
    this.socket!.write(`${line}\r\n`);
    return this.expect();
  }

  /**
   * Runs one message. Returns the reply to the final dot.
   *
   * With PIPELINING (RFC 2920) MAIL, RCPT and DATA go out in a single write
   * and their three replies are collected together, so a message costs two
   * round trips instead of four. Against a peer 40ms away that halves the
   * dialog; against a real MBP it is the single largest saving available,
   * because every stage of the conversation is pure network latency and the
   * client contributes nothing measurable.
   */
  async send(from: string, to: string, body: string): Promise<string> {
    if (this.pipelining) {
      const replies = [this.expect(), this.expect(), this.expect()];
      this.socket!.write(`MAIL FROM:<${from}>\r\nRCPT TO:<${to}>\r\nDATA\r\n`);
      await Promise.all(replies);
    } else {
      await this.command(`MAIL FROM:<${from}>`);
      await this.command(`RCPT TO:<${to}>`);
      await this.command('DATA');
    }
    const reply = await this.command(`${body}\r\n.`);
    this.messagesSent++;
    return reply;
  }

  destroy(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}

/** Fixed-size pool. Disabled by `--no-pool`, so every send dials afresh. */
class Pool {
  private idle: Connection[] = [];

  constructor(
    private host: string,
    private port: number,
    private enabled: boolean,
    private max: number,
    private allowPipelining = true,
  ) {}

  async acquire(): Promise<{ connection: Connection; tcpMs: number }> {
    if (this.enabled) {
      const reused = this.idle.pop();
      if (reused?.isOpen) return { connection: reused, tcpMs: 0 };
    }
    const connection = new Connection(this.host, this.port, this.allowPipelining);
    const tcpMs = await connection.connect();
    return { connection, tcpMs };
  }

  release(connection: Connection): void {
    if (!this.enabled || !connection.isOpen || this.idle.length >= this.max) {
      connection.destroy();
      return;
    }
    this.idle.push(connection);
  }

  drain(): void {
    for (const c of this.idle) c.destroy();
    this.idle = [];
  }
}

const BODY = [
  'From: bench@posta.test',
  'To: sink@posta.test',
  'Subject: Posta delivery benchmark',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Benchmark payload. '.repeat(40),
].join('\r\n');

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const sink = await startSink({ latencyMs: opts.sinkLatencyMs, deferRate: opts.deferRate });
  const pool = new Pool('127.0.0.1', sink.port, opts.pool, opts.concurrency, opts.pipeline);
  const recorder = new Recorder();

  const total = Math.round(opts.rate * opts.durationSec);
  const intervalMs = 1000 / opts.rate;

  console.log(
    `\n▸ ${total} messages at ${opts.rate}/s for ${opts.durationSec}s  ` +
      `pool=${opts.pool ? 'on' : 'off'}  pipeline=${opts.pipeline ? 'on' : 'off'}  ` +
      `sinkLatency=${opts.sinkLatencyMs}ms  ` +
      `deferRate=${opts.deferRate}\n`,
  );

  const startedAt = performance.now();
  const inFlight = new Set<Promise<void>>();
  let deferred = 0;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    // The send is *due* at this instant regardless of what else is happening.
    const dueAt = startedAt + i * intervalMs;
    const waitMs = dueAt - performance.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    const task = (async () => {
      const actualStart = performance.now();
      try {
        const { connection, tcpMs } = await pool.acquire();
        if (tcpMs > 0) recorder.recordDuration('tcp', tcpMs);

        const dialogStart = performance.now();
        const reply = await connection.send('bench@posta.test', 'sink@posta.test', BODY);
        recorder.recordDuration('smtp_dialog', performance.now() - dialogStart);

        if (reply.startsWith('4') || reply.startsWith('5')) deferred++;
        pool.release(connection);

        // Measured from `dueAt`, not `actualStart`: see the note on
        // coordinated omission above.
        recorder.record('total', performance.now(), dueAt, actualStart);
      } catch {
        failed++;
      }
    })();

    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  }

  await Promise.all([...inFlight]);
  const wallSec = (performance.now() - startedAt) / 1000;

  const report = recorder.report();
  const gate = meetsGate(report);
  const s = sink.stats();

  console.log(formatReport(report));
  console.log(
    `\nthroughput   ${(recorder.count('total') / wallSec).toFixed(0)}/s over ${wallSec.toFixed(1)}s`,
  );
  console.log(`connections  ${s.connections}  (${s.reuseRatio.toFixed(1)} msgs/conn)`);
  console.log(`deferred     ${deferred}   failed ${failed}`);
  console.log(`late starts  ${recorder.lateStarts}  ← harness fell behind this many times`);
  console.log(`sink service ${s.maxServiceMs.toFixed(2)}ms max  ← must be ~0 or results are invalid`);

  console.log(
    `\ngate p50<${SPIKE_GATE.p50}ms p99<${SPIKE_GATE.p99}ms: ` +
      (gate.pass ? 'PASS' : `FAIL — ${gate.reason}`),
  );

  pool.drain();
  await sink.close();
  process.exit(gate.pass ? 0 : 1);
}

if (import.meta.main) await main();
