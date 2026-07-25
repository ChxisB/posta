import { type Server, type Socket } from 'bun';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import type { PostaConfig } from '@posta/core';
import { getMainDb } from '@posta/core';
import { SmtpStateMachine, type SmtpCommandResult } from './state-machine';

interface SmtpConnection {
  socket: Socket;
  stateMachine: SmtpStateMachine;
  buffer: Buffer;
  crPresent: boolean;
  prevCrPresent: boolean;
  messageHandler: ((line: string) => SmtpCommandResult | null) | null;
}

/**
 * SMTP Server — Bun TCP listener.
 *
 * Replaces Ruby SMTPServer::Server (nio4r-based event loop).
 * Each connection gets a SmtpStateMachine instance.
 */
export type MessageReceivedCallback = (msg: {
  mailFrom: string;
  rcptTo: string;
  rawMessage: string;
  sourceIp: string;
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

    console.log(`[smtp-server] listening on ${bindAddress}:${port}`);
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
      messageHandler: null,
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

    // Accumulate buffer and process complete lines
    conn.buffer = Buffer.concat([conn.buffer, data]);

    // If there's an active DATA handler, feed raw data differently
    // (DATA mode lines are terminated by \r\n.\r\n, not just \n)

    if (conn.messageHandler) {
      this.processDataMode(socket, conn);
    } else {
      this.processCommandMode(socket, conn);
    }
  }

  private processCommandMode(socket: Socket, conn: SmtpConnection): void {
    while (true) {
      // Look for \n in the buffer
      const newlineIndex = conn.buffer.indexOf(0x0a); // '\n'
      if (newlineIndex < 0) break;

      // Extract the line (excluding \n)
      const lineBuf = conn.buffer.subarray(0, newlineIndex);
      conn.buffer = conn.buffer.subarray(newlineIndex + 1);

      const line = lineBuf.toString('utf-8');

      // Track CR presence
      conn.prevCrPresent = conn.crPresent;
      conn.crPresent = line.endsWith('\r');
      const cleanLine = conn.crPresent ? line.slice(0, -1) : line;

      // Handle through state machine
      const result = conn.stateMachine.handleLine(cleanLine, conn.crPresent, conn.prevCrPresent);
      if (result) {
        this.processResult(socket, conn, result);
      }

      if (conn.stateMachine.finished) {
        try { socket.end(); } catch {}
        return;
      }
    }
  }

  private processDataMode(socket: Socket, conn: SmtpConnection): void {
    // In DATA mode, we read until \r\n.\r\n
    const str = conn.buffer.toString('utf-8');

    // Check for end-of-data marker
    const endMarker = '\r\n.\r\n';
    const endIndex = str.indexOf(endMarker);

    if (endIndex >= 0) {
      // Process all complete lines up to the end marker
      const dataSection = str.slice(0, endIndex);
      conn.buffer = Buffer.from(str.slice(endIndex + endMarker.length));

      // Split into lines and feed to the state machine
      const lines = dataSection.split('\r\n');
      for (const dataLine of lines) {
        const result = conn.stateMachine.handleLine(dataLine, true, true);
        if (result) {
          this.processResult(socket, conn, result);
        }
      }

      // The last line was the end marker — feed the "."
      const finalResult = conn.stateMachine.handleLine('.', true, true);
      if (finalResult) {
        this.processResult(socket, conn, finalResult);
      }

      conn.messageHandler = null;

    } else {
      // Check if we have a partial end marker at the end of buffer
      // (e.g. just "\r\n." without the final \r\n)
      const partialEnd = str.endsWith('\r\n.');
      if (partialEnd && conn.buffer.length > 3) {
        // Don't process yet — wait for the final \r\n
        // But do process all complete lines before the partial marker
        const beforePartial = str.slice(0, str.length - 3);
        const lines = beforePartial.split('\r\n');
        for (const dataLine of lines) {
          const result = conn.stateMachine.handleLine(dataLine, true, true);
          if (result) {
            this.processResult(socket, conn, result);
          }
        }
        conn.buffer = Buffer.from('\r\n.');
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

  private processResult(socket: Socket, conn: SmtpConnection, result: SmtpCommandResult): void {
    const firstLine = result.lines[0] ?? '';

    // Intercept auth/rcpt signals BEFORE sending lines to client
    if (firstLine === '__AUTH_PLAIN_LOGIN__' && result.lines.length >= 2) {
      this.authenticatePlainLogin(socket, conn, result.lines[1]);
      return;
    }

    if (firstLine === '__AUTH_CRAM_MD5__' && result.lines.length >= 4) {
      this.authenticateCramMd5(socket, conn, result.lines[1], result.lines[2], result.lines[3]);
      return;
    }

    if (firstLine === '__RCPT_TO_VERIFY__' && result.lines.length >= 2) {
      this.verifyRcptTo(socket, conn, result.lines[1]);
      return;
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

    // Handle data handler
    if (result.dataHandler === null && conn.messageHandler) {
      conn.messageHandler = null;
      this.handleCompleteMessage(socket, conn);
    } else if (result.dataHandler) {
      conn.messageHandler = result.dataHandler as any;
    }
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

  private authenticatePlainLogin(socket: Socket, conn: SmtpConnection, password: string): void {
    try {
      const db = getMainDb(this.config);

      const row = db.query(
        `SELECT c.id, c.server_id, s.permalink as server_permalink, o.permalink as org_permalink
         FROM credentials c
         JOIN servers s ON s.id = c.server_id
         JOIN organizations o ON o.id = s.organization_id
         WHERE c.type = 'SMTP' AND c.key = ? LIMIT 1`,
      ).get(password) as any;

      if (!row) {
        this.sendAuthFailure(socket, conn, '535 Invalid credential');
        return;
      }

      conn.stateMachine.credential = { id: row.id, server_id: row.server_id };
      db.run(`UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?`, [row.id]);
      this.sendLine(socket, `235 Granted for ${row.org_permalink}/${row.server_permalink}`);
      conn.stateMachine.passwordExpected = false;
    } catch (err: any) {
      console.error('[smtp] auth error:', err.message);
      this.sendAuthFailure(socket, conn, '535 Invalid credential');
    }
  }

  private authenticateCramMd5(socket: Socket, conn: SmtpConnection, username: string, challenge: string, password: string): void {
    try {
      const db = getMainDb(this.config);

      const parsed = /^([^/]+)[/_](.+)$/.exec(username);
      if (!parsed) {
        this.sendAuthFailure(socket, conn, '535 Denied');
        return;
      }
      const orgPermalink = parsed[1];
      const serverPermalink = parsed[2];

      const server = db.query(
        `SELECT s.id FROM servers s JOIN organizations o ON o.id = s.organization_id WHERE o.permalink = ? AND s.permalink = ?`,
      ).get(orgPermalink, serverPermalink) as any;

      if (!server) {
        this.sendAuthFailure(socket, conn, '535 Denied');
        return;
      }

      const credentials = db.query(
        `SELECT id, key FROM credentials WHERE type = 'SMTP' AND server_id = ?`,
      ).all(server.id) as any[];

      for (const cred of credentials) {
        const expected = createHmac('md5', cred.key).update(challenge).digest('hex');
        if (password === expected) {
          conn.stateMachine.credential = { id: cred.id, server_id: server.id };
          db.run(`UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?`, [cred.id]);
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

  private verifyRcptTo(socket: Socket, conn: SmtpConnection, rcptTo: string): void {
    try {
      // Check server suspension (if authenticated)
      if (conn.stateMachine.credential) {
        const db = getMainDb(this.config);
        const server = db.query(
          `SELECT s.suspended_at, o.suspended_at as org_suspended_at
           FROM servers s JOIN organizations o ON o.id = s.organization_id
           WHERE s.id = ?`,
        ).get(conn.stateMachine.credential.server_id) as any;

        if (server?.suspended_at || server?.org_suspended_at) {
          this.sendLine(socket, '535 Mail server has been suspended');
          return;
        }
      } else {
        // No auth — check SMTP-IP allowlist
        const db = getMainDb(this.config);
        const ipCredentials = db.query(
          `SELECT c.key FROM credentials c WHERE c.type = 'SMTP-IP'`,
        ).all() as any[];

        const clientIp = conn.stateMachine.ipAddress ?? '';
        let ipMatch = false;
        for (const cred of ipCredentials) {
          const ip = cred.key;
          if (ip === clientIp || (ip.includes('/') && this.ipInCidr(clientIp, ip))) {
            ipMatch = true;
            break;
          }
        }

        if (!ipMatch) {
          this.sendLine(socket, '530 Authentication required');
          return;
        }
      }

      // Verified — send OK
      this.sendLine(socket, '250 OK');
    } catch (err: any) {
      console.error('[smtp] rcpt to verify error:', err.message);
      this.sendLine(socket, '250 OK');
    }
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
   * Handle a complete message after DATA.
   * Creates the message in the MessageDB and queues it.
   */
  private handleCompleteMessage(socket: Socket, conn: SmtpConnection): void {
    const mailFrom = conn.stateMachine.mailFrom ?? '';
    const rcptTo = conn.stateMachine.recipients?.[0]?.address ?? '';
    const rawMessage = conn.stateMachine.messageData ?? '';
    const sourceIp = conn.stateMachine.ipAddress ?? socket.remoteAddress ?? '';

    if (!this.onMessage) {
      console.log(`[smtp] no message handler configured, discarding message from ${mailFrom} to ${rcptTo}`);
      return;
    }

    // Fire-and-forget: don't block the SMTP session on endpoint delivery
    this.onMessage({ mailFrom, rcptTo, rawMessage, sourceIp }).catch((err: Error) => {
      console.error(`[smtp] message handler error:`, err.message);
    });
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
