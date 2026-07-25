import OrgLayout from '@/components/org-layout';

export default function HelpPage() {
  return (
    <OrgLayout>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Help</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Outgoing Email</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            To send outgoing email, add a domain to your server, verify it, and configure your DNS records (SPF, DKIM, MX). Then use SMTP credentials or the REST API to send messages through the server.
          </p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Incoming Email</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            To receive email, add a domain and configure a route to forward incoming messages to an HTTP or SMTP endpoint. Routes determine how incoming mail is processed.
          </p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>SMTP Credentials</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            Create SMTP credentials to authenticate your email clients (email apps, marketing platforms, etc.) with your Posta server. Use these in your email client&apos;s SMTP settings.
          </p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>API Keys</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            API keys allow programmatic access to send and query messages. Use the X-API-Key header with your API key to authenticate requests to the REST API.
          </p>
        </div>
      </div>
    </OrgLayout>
  );
}
