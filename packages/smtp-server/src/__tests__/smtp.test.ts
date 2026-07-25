import { describe, it, expect } from 'bun:test';
import { SmtpStateMachine } from '../state-machine';

function simulateClient(serverHostname: string) {
  const sm = new SmtpStateMachine(serverHostname, '127.0.0.1');
  return sm;
}

describe('SMTP State Machine', () => {
  it('starts in welcome state with an IP', () => {
    const sm = simulateClient('mail.example.com');
    expect(sm.state).toBe('welcome');
    expect(sm.ipAddress).toBe('127.0.0.1');
    expect(sm.traceId).toBeDefined();
  });

  it('starts in preauth state without an IP (proxy protocol)', () => {
    const sm = new SmtpStateMachine('mail.example.com', null);
    expect(sm.state).toBe('preauth');
  });

  it('responds to EHLO with capabilities', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('EHLO client.example.com', true, false);
    expect(result).not.toBeNull();
    expect(result!.lines[0]).toBe('250-My capabilities are');
    expect(result!.lines.some((l) => l.includes('AUTH'))).toBeTrue();
    expect(sm.heloName).toBe('client.example.com');
    expect(sm.state).toBe('welcomed');
  });

  it('responds to HELO', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('HELO client.example.com', true, false);
    expect(result).not.toBeNull();
    expect(result!.lines[0]).toBe('250 mail.example.com');
    expect(sm.heloName).toBe('client.example.com');
  });

  it('responds to QUIT', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('QUIT', true, false);
    expect(result!.lines[0]).toBe('221 Closing Connection');
    expect(result!.finished).toBeTrue();
  });

  it('responds to NOOP', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    const result = sm.handleLine('NOOP', true, false);
    expect(result!.lines[0]).toBe('250 OK');
  });

  it('handles MAIL FROM after EHLO', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    const result = sm.handleLine('MAIL FROM:<sender@example.com>', true, false);
    expect(result!.lines[0]).toBe('250 OK');
    expect(sm.mailFrom).toBe('sender@example.com');
    expect(sm.state).toBe('mail_from_received');
  });

  it('rejects MAIL FROM without EHLO', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('MAIL FROM:<sender@test.com>', true, false);
    expect(result!.lines[0]).toBe('503 EHLO/HELO first please');
  });

  it('handles RCPT TO after MAIL FROM', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    sm.handleLine('MAIL FROM:<sender@test.com>', true, false);
    const result = sm.handleLine('RCPT TO:<recipient@test.com>', true, false);
    expect(result!.lines[0]).toBe('__RCPT_TO_VERIFY__');
    expect(sm.state).toBe('rcpt_to_received');
    expect(sm.recipients.length).toBe(1);
  });

  it('rejects RCPT TO without MAIL FROM', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('RCPT TO:<recipient@test.com>', true, false);
    expect(result!.lines[0]).toBe('503 EHLO/HELO and MAIL FROM first please');
  });

  it('handles DATA and message body', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    sm.handleLine('MAIL FROM:<sender@test.com>', true, false);
    sm.handleLine('RCPT TO:<recipient@test.com>', true, false);

    const dataResult = sm.handleLine('DATA', true, false);
    expect(dataResult!.lines[0]).toBe('354 Go ahead');

    // Feed message lines
    sm.handleLine('Subject: Test', true, true);
    sm.handleLine('From: sender@test.com', true, true);
    sm.handleLine('', true, true); // end of headers
    sm.handleLine('Hello world', true, true);

    // End of message
    const finalResult = sm.handleLine('.', true, true);
    expect(finalResult!.lines[0]).toBe('250 OK');
  });

  it('rejects DATA without RCPT TO', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    const result = sm.handleLine('DATA', true, false);
    expect(result!.lines[0]).toBe('503 HELO/EHLO, MAIL FROM and RCPT TO before sending data');
  });

  it('handles RSET to reset transaction', () => {
    const sm = simulateClient('mail.example.com');
    sm.handleLine('EHLO test', true, false);
    sm.handleLine('MAIL FROM:<sender@test.com>', true, false);
    sm.handleLine('RCPT TO:<recipient@test.com>', true, false);
    expect(sm.recipients.length).toBe(1);

    const result = sm.handleLine('RSET', true, false);
    expect(result!.lines[0]).toBe('250 OK');
    expect(sm.recipients.length).toBe(0);
    expect(sm.state).toBe('welcomed');
  });

  it('handles STARTTLS when available', () => {
    const sm = new SmtpStateMachine('mail.example.com', '127.0.0.1', { tlsAvailable: true });
    const result = sm.handleLine('STARTTLS', true, false);
    expect(result!.lines[0]).toBe('220 Ready to start TLS');
    expect(result!.startTls).toBeTrue();
  });

  it('rejects STARTTLS when not available', () => {
    const sm = new SmtpStateMachine('mail.example.com', '127.0.0.1', { tlsAvailable: false });
    const result = sm.handleLine('STARTTLS', true, false);
    expect(result!.lines[0]).toBe('502 TLS not available');
  });

  it('handles proxy protocol in preauth state', () => {
    const sm = new SmtpStateMachine('mail.example.com', null, { proxyProtocol: true });
    expect(sm.state).toBe('preauth');
    const result = sm.handleLine('PROXY TCP4 192.168.1.1 10.0.0.1 56324 25', true, false);
    expect(result).not.toBeNull();
    expect(result!.lines[0]).toContain('220');
    expect(sm.ipAddress).toBe('192.168.1.1');
    expect(sm.state).toBe('welcome');
  });

  it('handles invalid commands', () => {
    const sm = simulateClient('mail.example.com');
    const result = sm.handleLine('UNKNOWN', true, false);
    expect(result!.lines[0]).toBe('502 Invalid/unsupported command');
  });
});
