import { KeyRound, Inbox, Send, Terminal } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';

const TOPICS = [
  {
    icon: Send,
    title: 'Outgoing email',
    body: 'Add a domain to your server, verify it, and publish the SPF, DKIM and MX records Posta generates for it. Once the domain verifies, send through the server with SMTP credentials or the REST API.',
  },
  {
    icon: Inbox,
    title: 'Incoming email',
    body: 'Add a domain, then add a route that forwards incoming messages to an HTTP or SMTP endpoint. Routes decide what happens to mail addressed to that domain.',
  },
  {
    icon: KeyRound,
    title: 'SMTP credentials',
    body: "Create SMTP credentials to authenticate mail clients — email apps, marketing platforms, application servers — against your Posta server. Use them in the client's SMTP settings.",
  },
  {
    icon: Terminal,
    title: 'API keys',
    body: 'API keys give programmatic access to send and query messages. Pass one in the X-API-Key header on every request to the REST API.',
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHeader
        title="Help"
        description="The four things most setups need. Each one starts from a verified domain."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {TOPICS.map(({ icon: Icon, title, body }) => (
          <Card key={title} padded>
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
              <Icon size={17} strokeWidth={2} aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
