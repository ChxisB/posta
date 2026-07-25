import net from 'node:net';
import tls from 'node:tls';
import type { SSLModesType } from './ssl_modes';

/**
 * Result of sending a single SMTP transaction.
 */
export interface SmtpResponse {
  code: number;
  message: string;
}

/**
 * State for the outbound SMTP session (client → remote server).
 */
export class SmtpSession {
  private host: string;
  private port: number;
  private sslMode: SSLModesType;
  private heloHostname: string;
  private openTimeout: number;
  private readTimeout: number;
  private sourceIpAddress: string | undefined;
  private socket: net.Socket | null;
  private tlsSocket: tls.TLSSocket | null;
  private buffer: string;
  private connected: boolean;
  private authenticated: boolean;

  constructor(options: {
    host: string;
    port: number;
    sslMode: SSLModesType;
    heloHostname: string;
    openTimeout?: number;
    readTimeout?: number;
    sourceIpAddress?: string;
  }) {
    this.host = options.host;
    this.port = options.port;
    this.sslMode = options.sslMode;
    this.heloHostname = options.heloHostname;
    this.openTimeout = options.openTimeout ?? 30;
    this.readTimeout = options.readTimeout ?? 30;
    this.sourceIpAddress = options.sourceIpAddress;
    this.socket = null;
    this.tlsSocket = null;
    this.buffer = '';
    this.connected = false;
    this.authenticated = false;
  }

  /**
   * Connect to the remote SMTP server.
   * Returns the greeting.
   */
  async connect(): Promise<SmtpResponse> {
    if (this.sslMode === 'TLS') {
      // Implicit TLS — wrap immediately
      await this.connectTls();
    } else {
      // Plain TCP first
      await this.connectTcp();
    }
    return this.readResponse();
  }

  /**
   * Send EHLO and get capabilities.
   */
  async ehlo(): Promise<string[]> {
    await this.sendCommand(`EHLO ${this.heloHostname}`);
    const response = await this.readMultilineResponse();
    // First line is `250-hostname`, subsequent lines are capabilities
    const capabilities = response.split('\r\n').slice(1).map((l) => l.replace(/^\d{3}[ -]/, '').trim());
    return capabilities;
  }

  /**
   * Send HELO (fallback if EHLO not supported).
   */
  async helo(): Promise<SmtpResponse> {
    await this.sendCommand(`HELO ${this.heloHostname}`);
    return this.readResponse();
  }

  /**
   * Start TLS on an existing connection.
   */
  async startTls(): Promise<SmtpResponse> {
    await this.sendCommand('STARTTLS');
    const response = await this.readResponse();
    if (response.code === 220) {
      await this.upgradeToTls();
    }
    return response;
  }

  /**
   * Authenticate with AUTH LOGIN.
   */
  async authLogin(username: string, password: string): Promise<SmtpResponse> {
    await this.sendCommand(`AUTH LOGIN`);
    await this.readResponse(); // 334 VXNlcm5hbWU6

    await this.sendRaw(Buffer.from(username).toString('base64'));
    await this.readResponse(); // 334 UGFzc3dvcmQ6

    await this.sendRaw(Buffer.from(password).toString('base64'));
    const response = await this.readResponse();
    if (response.code === 235) {
      this.authenticated = true;
    }
    return response;
  }

  /**
   * Authenticate with AUTH PLAIN.
   */
  async authPlain(username: string, password: string): Promise<SmtpResponse> {
    const authStr = `\0${username}\0${password}`;
    const encoded = Buffer.from(authStr).toString('base64');
    await this.sendCommand(`AUTH PLAIN ${encoded}`);
    const response = await this.readResponse();
    if (response.code === 235) {
      this.authenticated = true;
    }
    return response;
  }

  /**
   * Send MAIL FROM.
   */
  async mailFrom(address: string): Promise<SmtpResponse> {
    await this.sendCommand(`MAIL FROM:<${address}>`);
    return this.readResponse();
  }

  /**
   * Send RCPT TO.
   */
  async rcptTo(address: string): Promise<SmtpResponse> {
    await this.sendCommand(`RCPT TO:<${address}>`);
    return this.readResponse();
  }

  /**
   * Send the message data.
   * Returns the final response.
   */
  async data(rawMessage: string): Promise<SmtpResponse> {
    await this.sendCommand('DATA');
    const greeting = await this.readResponse();
    if (greeting.code !== 354) return greeting;

    // Send the message body with dot-stuffing
    const lines = rawMessage.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('.')) {
        await this.sendRaw('.' + line);
      } else {
        await this.sendRaw(line);
      }
      await this.sendRaw('\r\n');
    }

    // End of data marker
    await this.sendRaw('\r\n.\r\n');
    return this.readResponse();
  }

  /**
   * Send RSET.
   */
  async rset(): Promise<SmtpResponse> {
    await this.sendCommand('RSET');
    return this.readResponse();
  }

  /**
   * Send QUIT and close.
   */
  async quit(): Promise<void> {
    try {
      await this.sendCommand('QUIT');
      await this.readResponse();
    } catch {
      // Ignore errors during quit
    }
    this.close();
  }

  /**
   * Close the connection.
   */
  close(): void {
    if (this.tlsSocket) {
      try { this.tlsSocket.end(); } catch {}
      try { this.tlsSocket.destroy(); } catch {}
      this.tlsSocket = null;
    }
    if (this.socket) {
      try { this.socket.end(); } catch {}
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  // ─── Private helpers ──────────────────────────────────

  private async connectTcp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.openTimeout * 1000);

      socket.on('connect', () => {
        socket.setTimeout(0);
        this.socket = socket;
        this.connected = true;
        resolve();
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timed out'));
      });

      const connectOpts: any = { port: this.port, host: this.host };
      if (this.sourceIpAddress) connectOpts.localAddress = this.sourceIpAddress;
      socket.connect(connectOpts);
    });
  }

  private async connectTls(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        host: this.host,
        port: this.port,
        rejectUnauthorized: this.sslMode !== 'Auto',
      };
      if (this.sourceIpAddress) (tlsOptions as any).localAddress = this.sourceIpAddress;
      const socket = tls.connect(tlsOptions);

      socket.on('connect', () => {
        this.tlsSocket = socket;
        this.socket = socket;
        this.connected = true;
        resolve();
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.setTimeout(this.openTimeout * 1000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timed out'));
      });
    });
  }

  private async upgradeToTls(): Promise<void> {
    if (!this.socket || this.tlsSocket) return;

    return new Promise((resolve, reject) => {
      const sock = this.socket!;
      const tlsSocket = (tls as any).connect({
        socket: sock,
        rejectUnauthorized: false,
        host: this.host,
      });

      tlsSocket.on('secureConnect', () => {
        this.tlsSocket = tlsSocket;
        this.socket = tlsSocket;
        resolve();
      });

      tlsSocket.on('error', (err: any) => {
        reject(err);
      });

      tlsSocket.setTimeout(this.readTimeout * 1000);
    });
  }

  private async sendCommand(command: string): Promise<void> {
    await this.sendRaw(command + '\r\n');
  }

  private async sendRaw(data: string): Promise<void> {
    const sock = this.tlsSocket ?? this.socket;
    if (!sock) throw new Error('Not connected');

    return new Promise((resolve, reject) => {
      sock!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async readResponse(): Promise<SmtpResponse> {
    const sock = this.tlsSocket ?? this.socket;
    if (!sock) return { code: -1, message: 'Not connected' };

    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        this.buffer += data.toString('utf-8');

        // SMTP responses end with \r\n
        // Single-line: `250 OK\r\n`
        // Multi-line: `250-First line\r\n250 Last line\r\n`
        // We check for a complete response pattern
        const lines = this.buffer.split('\r\n');

        // A complete SMTP response is when the last line starts with
        // a 3-digit code followed by a space (not a hyphen)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length >= 3) {
            const code = parseInt(lines[i].slice(0, 3), 10);
            if (!isNaN(code) && lines[i][3] === ' ') {
              // Check if all preceding lines (if any) start with the same code + hyphen
              let complete = true;
              for (let j = 0; j < i; j++) {
                const l = lines[j];
                if (l.length >= 3 && l[3] !== '-') {
                  complete = false;
                  break;
                }
              }
              if (complete) {
                this.buffer = lines.slice(i + 1).join('\r\n');
                cleanup();
                resolve({
                  code,
                  message: lines[i].slice(4).trim(),
                });
                return;
              }
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        sock!.removeListener('data', onData);
        sock!.removeListener('error', onError);
      };

      sock!.on('data', onData);
      sock!.on('error', onError);

      // Process any buffered data immediately
      if (this.buffer.length > 0) {
        onData(Buffer.from(''));
      }
    });
  }

  private async readMultilineResponse(): Promise<string> {
    const sock = this.tlsSocket ?? this.socket;
    if (!sock) return '';

    return new Promise((resolve, reject) => {
      let fullResponse = '';

      const onData = (data: Buffer) => {
        this.buffer += data.toString('utf-8');

        const lines = this.buffer.split('\r\n');
        const lastLine = lines[lines.length - 1];

        // A multi-line SMTP response ends with a line that starts with
        // a 3-digit code followed by a space
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (l.length >= 3) {
            const code = parseInt(l.slice(0, 3), 10);
            if (!isNaN(code) && (l[3] === ' ' || l[3] === '-')) {
              fullResponse += l + '\r\n';
              if (l[3] === ' ') {
                // Last line of the multiline response
                this.buffer = lines.slice(i + 1).join('\r\n');
                cleanup();
                resolve(fullResponse.trim());
                return;
              }
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        sock!.removeListener('data', onData);
        sock!.removeListener('error', onError);
      };

      sock!.on('data', onData);
      sock!.on('error', onError);
    });
  }
}
