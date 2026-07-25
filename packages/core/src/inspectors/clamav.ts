/**
 * ClamAV virus scanning.
 *
 * Port of lib/posta/message_inspectors/clamav.rb
 * Connects to a ClamAV daemon via TCP and sends a raw message
 * using the INSTREAM protocol, then parses the result.
 */

import net from 'node:net';

export interface ClamavConfig {
  host: string;
  port: number;
}

export interface ClamavResult {
  threat: boolean;
  message: string;
}

/**
 * Scan a raw email message with ClamAV.
 *
 * Opens a TCP connection, sends the message using the INSTREAM
 * protocol (zINSTREAM header, length-prefixed chunks, null terminator),
 * and parses the response.
 *
 * NOTE: We intentionally do NOT half-close the client socket after writing
 * (no socket.end()). The INSTREAM protocol's zero-length chunk signals
 * end-of-data, and the server closes the connection after responding.
 * This is required for Bun compatibility — half-closing the client prevents
 * the server response from being delivered.
 *
 * We use setNoDelay(true) to ensure all writes are flushed promptly.
 *
 * @param config    - ClamAV daemon connection details
 * @param rawMessage - Complete raw email (headers + body)
 * @param timeout   - Timeout in milliseconds (default 10s)
 */
export async function scanWithClamav(
  config: ClamavConfig,
  rawMessage: string,
  timeout?: number,
): Promise<ClamavResult> {
  const timeoutMs = timeout ?? 10_000;

  try {
    const data = await connectAndScan(config, rawMessage, timeoutMs);
    if (!data) {
      return { threat: false, message: 'Could not scan message' };
    }

    // Parse response: "stream: RESULT\0..." or "stream: RESULT\n..."
    const match = data.match(/^stream:\s+(.*?)[\s\0]+?/);
    if (match) {
      const result = match[1].trim();
      if (result.toUpperCase() === 'OK') {
        return { threat: false, message: 'No threats found' };
      }
      return { threat: true, message: result };
    }

    return { threat: false, message: 'Could not scan message' };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'timeout') {
      return { threat: false, message: 'Timed out scanning for threats' };
    }
    return { threat: false, message: 'Error when scanning for threats' };
  }
}

/**
 * Connect, send INSTREAM data, and read response.
 *
 * Uses event-based reading (data + end events) because Bun's for-await
 * does not deliver chunks when the client has half-closed the socket.
 */
function connectAndScan(
  config: ClamavConfig,
  rawMessage: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection(config.port, config.host);
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);

    const chunks: Buffer[] = [];

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on('end', () => {
      if (!timedOut) {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString());
      }
    });

    socket.on('error', (err: Error) => {
      if (!timedOut) {
        clearTimeout(timer);
        reject(err);
      }
    });

    socket.on('connect', () => {
      // Disable Nagle's algorithm to flush writes immediately.
      // This is needed in Bun because we don't half-close the socket.
      socket.setNoDelay(true);

      // Send INSTREAM header (10 bytes: "zINSTREAM\0")
      socket.write('zINSTREAM\0');

      // Write message length as 4-byte big-endian unsigned integer
      const messageBuffer = Buffer.from(rawMessage);
      const lengthPrefix = Buffer.alloc(4);
      lengthPrefix.writeUInt32BE(messageBuffer.length, 0);
      socket.write(lengthPrefix);
      socket.write(messageBuffer);

      // Write terminating null chunk (4 bytes of zero).
      // The server sees this and knows the message is complete.
      // We intentionally do NOT call socket.end() — the server
      // will close the connection after responding.
      socket.write(Buffer.alloc(4, 0));
    });
  });
}
