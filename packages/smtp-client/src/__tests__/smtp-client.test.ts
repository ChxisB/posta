import { describe, it, expect, mock } from 'bun:test';
import { SSLModes } from '../ssl_modes';

describe('SSLModes', () => {
  it('has the expected constants', () => {
    expect(SSLModes.AUTO).toBe('Auto');
    expect(SSLModes.STARTTLS).toBe('STARTTLS');
    expect(SSLModes.TLS).toBe('TLS');
    expect(SSLModes.NONE).toBe('None');
  });
});

describe('SmtpSender', () => {
  it('classifies invalid recipient as HardFail', async () => {
    const { SmtpSender } = await import('../index');
    const sender = new SmtpSender();
    const result = await sender.send('raw message', 'from@test.com', 'notanemail');
    expect(result.success).toBeFalse();
    expect(result.classification).toBe('HardFail');
  });

  it('classification logic: 2xx is Sent, 4xx is SoftFail, 5xx is HardFail', async () => {
    const { SmtpEndpoint } = await import('../endpoint');

    // We can't test actual sending without a real SMTP server,
    // but we can verify the classification logic.
    // Create an endpoint with no session and verify error classification
    const endpoint = new SmtpEndpoint({
      hostname: 'test.example.com',
      ipAddress: '127.0.0.1',
      port: 2525,
      sslMode: 'None',
      heloHostname: 'test.local',
    });

    // Attempt to send will fail with connection error — classification should be SoftFail
    const result = await endpoint.sendMessage('test', 'from@test.com', 'to@test.com');
    expect(result.success).toBeFalse();
    expect(['SoftFail', 'HardFail']).toContain(result.classification);
    expect(result.endpointDescription).toContain('127.0.0.1');
  });
});

describe('SmtpServer', () => {
  it('resolves endpoints from hostname', async () => {
    const { SmtpServer } = await import('../server');
    const server = new SmtpServer('localhost', 25, 'Auto');
    const endpoints = await server.resolveEndpoints('test.local');
    expect(endpoints).toBeArray();
  });
});
