import { type Socket } from 'bun';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import type { PostaConfig } from '@posta/core';
import { getMainDb } from '@posta/core';
import {
  SmtpStateMachine,
  type ReceivedMessage,
  type Recipient,
  type SmtpCommandResult,
} from './state-machine';

interface SmtpConnection {
  socket: Socket;
  stateMachine: SmtpStateMachine;
  buffer: Buffer;
  crPresent: boolean;
  prevCrPresent: boolean;
  /**
   * Set while a reply waits on the database. Lines that arrive meanwhile stay
   * in the buffer, so a pipelining client's commands run in the order sent.
   */
  busy: boolean;
}

/**
 * SMTP Server — Bun TCP listener.
 *
 * Replaces Ruby SMTPServer::Server (nio4r-based event loop).
 * Each connection gets a SmtpStateMachine instance.
 */
export type MessageReceivedCallback = (msg: {
  mailFrom: string;
  /** Each accepted recipient, classified by verifyRcptTo. */
  recipients: Recipient[];
  /** The message as received, one character per byte. */
  rawMessage: string;
  sourceIp: string;
  tls: boolean;
}) => Promise<void>;

export class SmtpServer {
  private config: PostaConfig;
  private connections: Map<Socket, SmtpConnection>;
  private server: any | null;
  private tlsCertificates: string[];
  private tlsPrivateKey: string | null;
  onMessage: MessageReceivedCallback | null;

  constructor(config: PostaConfig) {
    this.config = config;
    this.connections = new Map();
    this.server = null;
    this.tlsCertificates = [];
    this.tlsPrivateKey = null;
    this.onMessage = null;
    this.loadTlsConfig();
  }

  /**
   * Start listening for SMTP connections.
   */
  start(): void {
    const bindAddress = process.env.SMTP_BIND_ADDRESS ?? this.config.smtp_server.default_bind_address;
    const port = parseInt(process.env.SMTP_PORT ?? String(this.config.smtp_server.default_port), 10);

    this.server = Bun.listen({
      hostname: bindAddress,
      port,
      socket: {
        open: (socket) => this.onOpen(socket),
        data: (socket, data) => this.onData(socket, data),
        close: (socket) => this.onClose(socket),
        error: (socket, error) => this.onError(socket, error),
        drain: (socket) => this.onDrain(socket),
      },
    });

    console.log(`[smtp-server] listening on ${bindAddress}:${this.port}`);
  }

  /** The port actually bound, which differs from the configured one when that is 0. */
  get port(): number {
    return this.server?.port ?? 0;
  }

  /**
   * Stop the server gracefully.
   */
  stop(): void {
    if (this.server) {
      this.server.stop(true);
      this.server = null;
    }
    for (const [socket] of this.connections) {
      try { socket.end(); } catch {}
    }
    this.connections.clear();
  }

  // ─── Socket handlers ───────────────────────────────────

  private onOpen(socket: Socket): void {
    const ipAddress = socket.remoteAddress.replace(/^::ffff:/, '');
    const useProxy = this.config.smtp_server.proxy_protocol;

    const stateMachine = new SmtpStateMachine(
      this.config.posta.smtp_hostname,
      useProxy ? null : ipAddress,
      {
        tlsAvailable: this.config.smtp_server.tls_enabled,
        maxMessageSize: this.config.smtp_server.max_message_size,
        proxyProtocol: useProxy,
      },
    );

    const conn: SmtpConnection = {
      socket,
      stateMachine,
      buffer: Buffer.alloc(0),
      crPresent: false,
      prevCrPresent: false,
      busy: false,
    };

    this.connections.set(socket, conn);

    // Send welcome banner (only if not using proxy protocol)
    if (!useProxy) {
      this.sendLine(socket, `220 ${this.config.posta.smtp_hostname} ESMTP Posta/${stateMachine.traceId}`);
    }

    if (this.config.smtp_server.log_connections) {
      console.log(`[smtp] connect from ${ipAddress} (trace: ${stateMachine.traceId})`);
    }
  }

  private onData(socket: Socket, data: Buffer): void {
    const conn = this.connections.get(socket);
    if (!conn) return;

    conn.buffer = Buffer.concat([conn.buffer, data]);
    if (!conn.busy) {
      this.processLines(socket, conn);
    }
  }

  /**
   * Feed each complete line to the state machine, commands and message data
   * alike. Stops while a reply is pending and picks up again once it is sent.
   */
  private processLines(socket: Socket, conn: SmtpConnection): void {
    while (!conn.busy) {
      const newlineIndex = conn.buffer.indexOf(0x0a); // '\n'
      if (newlineIndex < 0) return;

      // latin1 keeps every byte as one character, so an 8-bit message body is
      // stored exactly as sent rather than mangled by UTF-8 decoding.
      const line = conn.buffer.subarray(0, newlineIndex).toString('latin1');
      conn.buffer = conn.buffer.subarray(newlineIndex + 1);

      // Track CR presence
      conn.prevCrPresent = conn.crPresent;
      conn.crPresent = line.endsWith('\r');
      const cleanLine = conn.crPresent ? line.slice(0, -1) : line;

      const result = conn.stateMachine.handleLine(cleanLine, conn.crPresent, conn.prevCrPresent);
      if (result) {
        const pending = this.processResult(socket, conn, result);
        if (pending) {
          conn.busy = true;
          const resume = () => {
            conn.busy = false;
            if (this.connections.has(socket)) this.processLines(socket, conn);
          };
          pending.then(resume, resume);
        }
        if (result.finished) return;
      }

      if (conn.stateMachine.finished) {
        try { socket.end(); } catch {}
        return;
      }
    }
  }

  private onClose(socket: Socket): void {
    if (this.config.smtp_server.log_connections) {
      const conn = this.connections.get(socket);
      console.log(`[smtp] disconnect (trace: ${conn?.stateMachine?.traceId ?? 'unknown'})`);
    }
    this.connections.delete(socket);
  }

  private onError(socket: Socket, error: Error): void {
    console.error(`[smtp] socket error:`, error.message);
    this.connections.delete(socket);
  }

  private onDrain(socket: Socket): void {
    // Buffer space is available again — nothing special needed
  }

  // ─── Response handling ─────────────────────────────────

  /**
   * Send the reply for one line. Returns a promise when the reply depends on
   * the database; the promise always resolves, having sent the reply itself.
   */
  private processResult(socket: Socket, conn: SmtpConnection, result: SmtpCommandResult): Promise<void> | null {
    const firstLine = result.lines[0] ?? '';

    // Intercept auth/rcpt signals BEFORE sending lines to client
    if (firstLine === '__AUTH_PLAIN_LOGIN__' && result.lines.length >= 2) {
      return this.authenticatePlainLogin(socket, conn, result.lines[1]);
    }

    if (firstLine === '__AUTH_CRAM_MD5__' && result.lines.length >= 4) {
      return this.authenticateCramMd5(socket, conn, result.lines[1], result.lines[2], result.lines[3]);
    }

    if (firstLine === '__RCPT_TO_VERIFY__' && result.lines.length >= 2) {
      return this.verifyRcptTo(socket, conn, result.lines[1]);
    }

    if (result.message) {
      return this.receiveMessage(socket, conn, result.message, result.lines);
    }

    // Send response lines
    for (const line of result.lines) {
      this.sendLine(socket, line);
    }

    // Handle start TLS
    if (result.startTls) {
      conn.stateMachine.tlsStarted = true;
      try {
        (socket as any).tls({
          key: this.tlsPrivateKey,
          cert: this.tlsCertificates.join('\n'),
        });
      } catch (err) {
        console.error('[smtp] TLS upgrade failed:', err);
        try { socket.end(); } catch {}
      }
    }

    // Handle finished
    if (result.finished) {
      try { socket.end(); } catch {}
    }

    return null;
  }

  private sendLine(socket: Socket, line: string): void {
    try {
      socket.write(line + '\r\n');
    } catch (err) {
      console.error('[smtp] write error:', (err as Error).message);
    }
  }

  private sendAuthFailure(socket: Socket, conn: SmtpConnection, message: string): void {
    this.sendLine(socket, message);
    conn.stateMachine.passwordExpected = false;
  }

  private async authenticatePlainLogin(socket: Socket, conn: SmtpConnection, password: string): Promise<void> {
    try {
      const db = getMainDb(this.config);

      const row = await db.get<{ id: number; server_id: number; server_permalink: string; org_permalink: string }>(
        `SELECT c.id, c.server_id, s.permalink as server_permalink, o.permalink as org_permalink
         FROM credentials c
         JOIN servers s ON s.id = c.server_id
         JOIN organizations o ON o.id = s.organization_id
         WHERE c.type = 'SMTP' AND c.key = $1 LIMIT 1`,
        [password],
      );

      if (!row) {
        this.sendAuthFailure(socket, conn, '535 Invalid credential');
        return;
      }

      conn.stateMachine.credential = { id: row.id, server_id: row.server_id };
      await db.run(`UPDATE credentials SET last_used_at = NOW() WHERE id = $1`, [row.id]);
      this.sendLine(socket, `235 Granted for ${row.org_permalink}/${row.server_permalink}`);
      conn.stateMachine.passwordExpected = false;
    } catch (err: any) {
      console.error('[smtp] auth error:', err.message);
      this.sendAuthFailure(socket, conn, '535 Invalid credential');
    }
  }

  private async authenticateCramMd5(socket: Socket, conn: SmtpConnection, username: string, challenge: string, password: string): Promise<void> {
    try {
      const db = getMainDb(this.config);

      const parsed = /^([^/]+)[/_](.+)$/.exec(username);
      if (!parsed) {
        this.sendAuthFailure(socket, conn, '535 Denied');
        return;
      }
      const orgPermalink = parsed[1];
      const serverPermalink = parsed[2];

      const server = await db.get<{ id: number }>(
        `SELECT s.id FROM servers s JOIN organizations o ON o.id = s.organization_id WHERE o.permalink = $1 AND s.permalink = $2`,
        [orgPermalink, serverPermalink],
      );

      if (!server) {
        this.sendAuthFailure(socket, conn, '535 Denied');
        return;
      }

      const credentials = await db.query<{ id: number; key: string }>(
        `SELECT id, key FROM credentials WHERE type = 'SMTP' AND server_id = $1`,
        [server.id],
      );

      for (const cred of credentials) {
        const expected = createHmac('md5', cred.key).update(challenge).digest('hex');
        if (password === expected) {
          conn.stateMachine.credential = { id: cred.id, server_id: server.id };
          await db.run(`UPDATE credentials SET last_used_at = NOW() WHERE id = $1`, [cred.id]);
          this.sendLine(socket, `235 Granted for ${orgPermalink}/${serverPermalink}`);
          conn.stateMachine.passwordExpected = false;
          return;
        }
      }

      this.sendAuthFailure(socket, conn, '535 Denied');
    } catch (err: any) {
      console.error('[smtp] cram-md5 auth error:', err.message);
      this.sendAuthFailure(socket, conn, '535 Denied');
    }
  }

  /**
   * Decide what the recipient just added is, or refuse it. An authenticated
   * client may send to anyone. Otherwise the address must match a route on a
   * verified domain (incoming mail), or the client's IP must hold an SMTP-IP
   * credential. Anything else is an attempt to relay through us.
   */
  private async verifyRcptTo(socket: Socket, conn: SmtpConnection, rcptTo: string): Promise<void> {
    const sm = conn.stateMachine;
    const recipient = sm.recipients[sm.recipients.length - 1];

    try {
      if (sm.credential) {
        if (await this.isSuspended(sm.credential.server_id)) {
          sm.rejectRecipient();
          this.sendLine(socket, '535 Mail server has been suspended');
          return;
        }
        recipient.type = 'credential';
        recipient.metadata = { serverId: sm.credential.server_id, credentialId: sm.credential.id };
        this.sendLine(socket, '250 OK');
        return;
      }

      const route = await this.findRoute(rcptTo);
      if (route) {
        recipient.type = 'route';
        recipient.metadata = { serverId: route.server_id, domainId: route.domain_id, routeId: route.id };
        this.sendLine(socket, '250 OK');
        return;
      }

      const ipCredential = await this.findIpCredential(sm.ipAddress ?? '');
      if (ipCredential) {
        if (await this.isSuspended(ipCredential.server_id)) {
          sm.rejectRecipient();
          this.sendLine(socket, '535 Mail server has been suspended');
          return;
        }
        recipient.type = 'credential';
        recipient.metadata = { serverId: ipCredential.server_id, credentialId: ipCredential.id };
        this.sendLine(socket, '250 OK');
        return;
      }

      sm.rejectRecipient();
      this.sendLine(socket, '530 Authentication required');
    } catch (err: any) {
      // Refuse for now rather than accept an address nothing has checked.
      console.error('[smtp] rcpt to verify error:', err.message);
      sm.rejectRecipient();
      this.sendLine(socket, '451 Temporary failure, please try again later');
    }
  }

  private async isSuspended(serverId: number): Promise<boolean> {
    const server = await getMainDb(this.config).get<{ suspended_at: string | null; org_suspended_at: string | null }>(
      `SELECT s.suspended_at, o.suspended_at as org_suspended_at
       FROM servers s JOIN organizations o ON o.id = s.organization_id
       WHERE s.id = $1`,
      [serverId],
    );
    return Boolean(server?.suspended_at || server?.org_suspended_at);
  }

  /**
   * The route that takes mail for this address: one named for its local part
   * (ignoring any +tag), else the domain's catch-all.
   */
  private async findRoute(address: string): Promise<{ id: number; server_id: number; domain_id: number } | null> {
    const at = address.lastIndexOf('@');
    const name = address.slice(0, at).split('+')[0].toLowerCase();
    const domain = address.slice(at + 1).toLowerCase();

    const route = await getMainDb(this.config).get<{ id: number; server_id: number; domain_id: number }>(
      `SELECT r.id, r.server_id, r.domain_id
       FROM routes r
       JOIN domains d ON d.id = r.domain_id
       WHERE lower(d.name) = $1
         AND d.verified_at IS NOT NULL
         AND d.incoming = 1
         AND (lower(r.name) = $2 OR r.name = '*')
       ORDER BY (r.name = '*')
       LIMIT 1`,
      [domain, name],
    );
    return route ?? null;
  }

  /** The SMTP-IP credential covering this address, the most specific first. */
  private async findIpCredential(clientIp: string): Promise<{ id: number; server_id: number } | null> {
    const credentials = await getMainDb(this.config).query<{ id: number; server_id: number; key: string }>(
      `SELECT id, server_id, key FROM credentials WHERE type = 'SMTP-IP'`,
    );

    let best: { id: number; server_id: number } | null = null;
    let bestBits = -1;
    for (const cred of credentials) {
      const ip = cred.key;
      const bits = ip.includes('/') ? parseInt(ip.split('/')[1], 10) : 128;
      if (bits <= bestBits) continue;
      if (ip === clientIp || (ip.includes('/') && this.ipInCidr(clientIp, ip))) {
        best = { id: cred.id, server_id: cred.server_id };
        bestBits = bits;
      }
    }
    return best;
  }

  private ipInCidr(ip: string, cidr: string): boolean {
    try {
      const [range, bitsStr] = cidr.split('/');
      const bits = parseInt(bitsStr, 10);
      if (!range || isNaN(bits)) return false;
      const ipNum = this.ipToNum(ip);
      const rangeNum = this.ipToNum(range);
      if (ipNum === null || rangeNum === null) return false;
      const mask = bits === 0 ? 0 : ~(2 ** (32 - bits) - 1);
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  private ipToNum(ip: string): number | null {
    try {
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) return null;
      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    } catch {
      return null;
    }
  }

  /**
   * Store a finished message, then answer. The 250 promises the client we
   * will deliver it, so it goes out only once the message is queued; on any
   * failure the client gets a 451 and keeps the message to try again.
   */
  private async receiveMessage(socket: Socket, conn: SmtpConnection, message: ReceivedMessage, lines: string[]): Promise<void> {
    if (!this.onMessage) {
      console.error('[smtp] no message handler configured, deferring message');
      this.sendLine(socket, '451 Unable to accept messages right now, please try again later');
      return;
    }

    try {
      await this.onMessage({
        mailFrom: message.mailFrom,
        recipients: message.recipients,
        rawMessage: message.data,
        sourceIp: conn.stateMachine.ipAddress ?? '',
        tls: conn.stateMachine.tlsStarted,
      });
    } catch (err: any) {
      console.error('[smtp] could not store message:', err.message);
      this.sendLine(socket, '451 Message could not be stored, please try again later');
      return;
    }

    for (const line of lines) {
      this.sendLine(socket, line);
    }
  }

  /**
   * Load TLS certificates.
   */
  private loadTlsConfig(): void {
    if (!this.config.smtp_server.tls_enabled) return;

    const certPath = this.config.smtp_server.tls_certificate_path;
    const keyPath = this.config.smtp_server.tls_private_key_path;

    if (existsSync(certPath)) {
      this.tlsCertificates = readFileSync(certPath, 'utf-8')
        .split('-----BEGIN CERTIFICATE-----')
        .filter((s) => s.trim())
        .map((s) => '-----BEGIN CERTIFICATE-----' + s);
    }

    if (existsSync(keyPath)) {
      this.tlsPrivateKey = readFileSync(keyPath, 'utf-8');
    }
  }
}
