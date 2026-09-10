'use client';

import { useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createEndpoint } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

export default function NewEndpointPage() {
  const { permalink, serverId } = useParams<{ permalink: string; serverId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') ?? 'http') as 'http' | 'smtp' | 'address';

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HTTP fields
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('JSON');
  const [stripReplies, setStripReplies] = useState(false);
  const [encoding, setEncoding] = useState('Base64');

  // SMTP fields
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('25');
  const [sslMode, setSslMode] = useState('Auto');

  // Address fields
  const [email, setEmail] = useState('');

  const validType = ['http', 'smtp', 'address'].includes(type) ? type : 'http';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let payload: any = { name };
    if (validType === 'http') {
      payload = { ...payload, url, format, strip_replies: stripReplies, encoding };
    } else if (validType === 'smtp') {
      payload = { ...payload, hostname, port: Number(port) || 25, ssl_mode: sslMode };
    } else {
      payload = { ...payload, email };
    }

    try {
      await createEndpoint(permalink, serverId, validType, payload);
      router.push(`/organizations/${permalink}/servers/${serverId}/endpoints`);
    } catch (err: any) {
      setError(err.message || 'Failed to create endpoint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/organizations/${permalink}/servers/${serverId}/endpoints`}
          style={{ color: 'var(--color-text-muted)', fontSize: 13 }}
        >
          &larr; Back to Endpoints
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        New {validType.toUpperCase()} Endpoint
      </h1>
      <div
        className="rounded-2xl border border-line bg-panel p-6 shadow-elev-sm"
        style={{ maxWidth: 500 }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 6,
              }}
            >
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Endpoint"
              required
            />
          </div>

          {validType === 'http' && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  URL
                </label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Format
                </label>
                <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="RawMessage">Raw RFC822</option>
                  <option value="JSON">JSON</option>
                </Select>
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Encoding
                </label>
                <Select value={encoding} onChange={(e) => setEncoding(e.target.value)}>
                  <option value="Base64">Base64</option>
                  <option value="QuotedPrintable">Quoted-Printable</option>
                </Select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="stripReplies"
                  type="checkbox"
                  checked={stripReplies}
                  onChange={(e) => setStripReplies(e.target.checked)}
                />
                <label htmlFor="stripReplies" style={{ fontSize: 14, cursor: 'pointer' }}>
                  Strip Replies
                </label>
              </div>
            </>
          )}

          {validType === 'smtp' && (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Hostname
                </label>
                <Input
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="smtp.example.com"
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Port
                </label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="25"
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  SSL Mode
                </label>
                <Select value={sslMode} onChange={(e) => setSslMode(e.target.value)}>
                  <option value="Auto">Auto</option>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="TLS">TLS</option>
                  <option value="None">None</option>
                </Select>
              </div>
            </>
          )}

          {validType === 'address' && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  marginBottom: 6,
                }}
              >
                Email Address
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="endpoint@example.com"
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Endpoint'}
            </Button>
            <Button type="button" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
