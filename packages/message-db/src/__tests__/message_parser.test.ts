import { describe, it, expect } from 'bun:test';
import { MessageParser } from '../message_parser';

describe('MessageParser', () => {
  const trackDomain = {
    domain: 'example.com', full_name: 'track.example.com',
    ssl_enabled: true, track_clicks: true, track_loads: true,
    excluded_click_domains: [], server_token: 'srvtok', message_token: 'msgtok',
  };

  it('returns original message when no track domain', async () => {
    const parser = new MessageParser(null);
    const result = await parser.parse('Content-Type: text/plain\r\n\r\nHello');
    expect(result).toBe('Content-Type: text/plain\r\n\r\nHello');
    expect(parser.tracked_links).toBe(0);
  });

  it('rewrites URLs in plain text', async () => {
    const parser = new MessageParser(trackDomain);
    const result = await parser.parse('Content-Type: text/plain\r\n\r\nVisit https://example.com/page today');
    expect(result).toContain('track.example.com/srvtok/');
    expect(parser.tracked_links).toBe(1);
  });

  it('rewrites href attributes in HTML', async () => {
    const parser = new MessageParser(trackDomain);
    const result = await parser.parse('Content-Type: text/html\r\n\r\n<a href="https://example.com/page">Link</a>');
    expect(result).toContain('track.example.com/srvtok/');
    expect(parser.tracked_links).toBe(1);
  });

  it('inserts tracking pixel in HTML', async () => {
    const parser = new MessageParser(trackDomain);
    const result = await parser.parse('Content-Type: text/html\r\n\r\n<html><body>Hello</body></html>');
    expect(result).toContain('ampimg');
    expect(result).toContain('/img/srvtok/msgtok');
    expect(parser.tracked_images).toBe(1);
  });

  it('does not track excluded domains', async () => {
    const td = { ...trackDomain, excluded_click_domains: ['example.com'] };
    const parser = new MessageParser(td);
    const result = await parser.parse('Content-Type: text/plain\r\n\r\nVisit https://example.com/page');
    expect(result).not.toContain('track.example.com');
    expect(parser.tracked_links).toBe(0);
  });

  it('handles notrack: protocol', async () => {
    const parser = new MessageParser(trackDomain);
    const result = await parser.parse('Content-Type: text/plain\r\n\r\nVisit https+notrack://example.com/page');
    expect(result).toContain('https://example.com/page');
    expect(result).not.toContain('track.example.com');
    expect(parser.isActioned()).toBe(true);
  });
});