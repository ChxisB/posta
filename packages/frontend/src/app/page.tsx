import Link from 'next/link';
import { Show } from '@clerk/nextjs';
import {
  ArrowRight,
  Ban,
  Building2,
  CircleCheck,
  CirclePause,
  Gauge,
  History,
  Inbox,
  Mail,
  MousePointerClick,
  Network,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  Webhook,
} from 'lucide-react';
import { SkipLink } from '@/components/ui/skip-link';
import { CopyButton } from '@/components/ui/copy-button';
import { DeliveryReel } from '@/components/reels/delivery-reel';
import { BounceReel, DnsReel, WebhookReel } from '@/components/reels/feature-reels';
import { isFirstRun } from '@/lib/api';

// The calls to action depend on whether this installation has an
// administrator yet, which changes the moment someone signs up.
export const dynamic = 'force-dynamic';

const REPO_URL = 'https://github.com/ChxisB/posta';

const PRIMARY_CTA =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-elev-md transition-[filter] hover:brightness-95 dark:hover:brightness-110';
const SECONDARY_CTA =
  'inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-panel px-6 text-sm font-semibold text-foreground shadow-elev-sm transition-colors hover:bg-panel-2';

/**
 * Public site for a Posta installation ("/"). Rendered bare, with no
 * dashboard shell — see components/shell/app-shell.tsx.
 *
 * It does two jobs: says what Posta does, and shows how to run it. Because
 * it is served by the installation itself, it also knows whether that
 * installation has been set up, and on a fresh one points the visitor at
 * creating the admin account rather than at a sign-in they cannot complete.
 *
 * Shares the token layer with the dashboard, but is the one place allowed to
 * spend on presentation: an accent wash behind the hero, a larger type
 * scale, and generous vertical rhythm.
 */
export default async function LandingPage() {
  const firstRun = await isFirstRun();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink href="#main">Skip to content</SkipLink>
      <SiteNav firstRun={firstRun} />
      {firstRun && (
        <Show when="signed-out">
          <FirstRunBanner />
        </Show>
      )}
      <main id="main">
        <Hero firstRun={firstRun} />
        <Features />
        <Showcase />
        <Setup />
        <CtaBand firstRun={firstRun} />
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Signed in: the dashboard, via /start, which also finishes provisioning.
 * Signed out: create the admin account on a fresh installation, otherwise
 * sign in.
 */
function PrimaryAction({
  firstRun,
  className,
  iconSize = 16,
}: {
  firstRun: boolean | null;
  className: string;
  iconSize?: number;
}) {
  return (
    <Show
      when="signed-in"
      fallback={
        firstRun ? (
          <Link href="/sign-up" className={className}>
            Create admin account <ArrowRight size={iconSize} aria-hidden />
          </Link>
        ) : (
          <Link href="/login" className={className}>
            Sign in <ArrowRight size={iconSize} aria-hidden />
          </Link>
        )
      }
    >
      <Link href="/start" className={className}>
        Open dashboard <ArrowRight size={iconSize} aria-hidden />
      </Link>
    </Show>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
        <Mail size={17} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">Posta</span>
    </Link>
  );
}

function SiteNav({ firstRun }: { firstRun: boolean | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
        <Logo />

        <nav
          aria-label="Site"
          className="ml-8 hidden items-center gap-6 text-sm text-muted md:flex"
        >
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#setup" className="transition-colors hover:text-foreground">
            Set up
          </a>
          <a href={REPO_URL} className="transition-colors hover:text-foreground">
            GitHub
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <PrimaryAction
            firstRun={firstRun}
            iconSize={15}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-[filter] hover:brightness-95 dark:hover:brightness-110"
          />
        </div>
      </div>
    </header>
  );
}

function FirstRunBanner() {
  return (
    <div className="border-b border-accent/20 bg-accent/8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm">
        <p className="text-foreground">
          <span className="font-semibold">This installation isn&apos;t set up yet.</span>{' '}
          <span className="text-muted">The first account created becomes its administrator.</span>
        </p>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
        >
          Create the admin account <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Hero({ firstRun }: { firstRun: boolean | null }) {
  return (
    <section className="relative overflow-hidden border-b border-line-soft">
      {/* Marketing-only treatment. Nothing in the dashboard uses a wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,var(--color-accent),transparent_60%)] opacity-[0.13]"
      />
      <div className="relative mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted shadow-elev-sm">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green" />
          Free and open source · MIT licensed · self-hosted
        </p>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Transactional email <span className="text-accent">you run yourself</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Posta sends and receives email for your applications. SMTP and an HTTP API for sending,
          routes for inbound mail, DKIM-signed delivery, and a full history of every message, all
          on your own servers.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PrimaryAction firstRun={firstRun} className={PRIMARY_CTA} />
          <a href="#setup" className={SECONDARY_CTA}>
            How to set it up
          </a>
        </div>

        <p className="mt-5 text-xs text-faint">
          No message caps, no licence key, no phone-home.
        </p>

        {/* The reel carries the speed claim. A duration cannot be shown in a
            screenshot, so this is the one thing on the page that actually
            demonstrates rather than asserts. */}
        <div className="mt-14 flex justify-center">
          <DeliveryReel />
        </div>
      </div>
    </section>
  );
}

const FEATURE_GROUPS = [
  {
    title: 'Sending',
    features: [
      {
        icon: Send,
        title: 'SMTP and HTTP API',
        body: 'Point any mail library at the SMTP server, or POST JSON or a raw message to the send API. Every server has its own credentials.',
      },
      {
        icon: Network,
        title: 'IP pools and rules',
        body: 'Choose which addresses each server sends from, and add rules that pick a pool by sender or recipient.',
      },
      {
        icon: Gauge,
        title: 'Send limits',
        body: 'Cap what each server can send, so one noisy app cannot spend the reputation the others depend on.',
      },
    ],
  },
  {
    title: 'Receiving',
    features: [
      {
        icon: Inbox,
        title: 'Inbound routing',
        body: 'Accept mail for your domains and hand it to an HTTP endpoint or forward it over SMTP. Routes decide what happens to each address.',
      },
      {
        icon: ShieldAlert,
        title: 'Spam and virus checks',
        body: 'Score inbound mail with Rspamd or SpamAssassin and scan attachments with ClamAV.',
      },
    ],
  },
  {
    title: 'Deliverability',
    features: [
      {
        icon: ShieldCheck,
        title: 'SPF, DKIM and MX verification',
        body: 'Posta generates the records for each domain, signs outgoing mail with DKIM, and checks the DNS until it resolves.',
      },
      {
        icon: Ban,
        title: 'Automatic suppression',
        body: 'A hard bounce adds the address to the suppression list, and later sends to it stop before they leave.',
      },
      {
        icon: MousePointerClick,
        title: 'Open and click tracking',
        body: 'Optional, per domain, served from a tracking domain of your own.',
      },
    ],
  },
  {
    title: 'Visibility',
    features: [
      {
        icon: History,
        title: 'Full delivery history',
        body: 'Every attempt, the remote server’s response and the bounce reason, not just a status word.',
      },
      {
        icon: CirclePause,
        title: 'Held messages and retries',
        body: 'Release held mail or retry a failed delivery from the dashboard or the API.',
      },
      {
        icon: Webhook,
        title: 'Signed webhooks',
        body: 'MessageSent, MessageDelayed, MessageDeliveryFailed and MessageHeld, signed and retried with backoff.',
      },
    ],
  },
  {
    title: 'Running it',
    features: [
      {
        icon: Building2,
        title: 'Organisations and servers',
        body: 'One organisation per product or customer, each with as many mail servers as it needs.',
      },
      {
        icon: Users,
        title: 'Your team, your rules',
        body: 'The first account is the administrator. Nobody else gets in until an administrator adds them.',
      },
    ],
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-b border-line-soft">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Everything an email platform needs
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Sending, receiving and the deliverability work in between, in one open source package
            you can read, change and run anywhere.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-14">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold tracking-wide text-accent uppercase">
                {group.title}
              </h3>
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.features.map(({ icon: Icon, title, body }) => (
                  <li
                    key={title}
                    className="rounded-2xl border border-line bg-panel p-6 shadow-elev-sm transition-shadow hover:shadow-elev-md"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
                      <Icon size={19} strokeWidth={2} aria-hidden />
                    </span>
                    <h4 className="mt-4 text-base font-semibold text-foreground">{title}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const SHOWCASE = [
  {
    title: 'Verification you can watch happen',
    body: 'Posta generates the SPF, DKIM and MX records for each domain and checks them until they resolve. Propagation is not instant and the dashboard says so, rather than leaving you guessing whether it worked.',
    reel: <DnsReel />,
  },
  {
    title: 'Bounces protect you automatically',
    body: 'A hard bounce suppresses the address on the spot, and the next send to it is stopped before it leaves. Continuing to mail dead addresses is the fastest way to lose a sending reputation, so nothing about it is left manual.',
    reel: <BounceReel />,
  },
  {
    title: 'Webhooks that survive your bad day',
    body: 'Every delivery event is posted to your endpoint and retried with backoff when it fails. An outage on your side does not cost you the events.',
    reel: <WebhookReel />,
  },
];

function Showcase() {
  return (
    <section className="border-b border-line-soft bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <h2 className="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          A closer look
        </h2>

        {/* Three mechanisms that a sentence cannot convey: DNS propagating,
            a bounce becoming a suppression, a webhook recovering. Alternating
            sides gives the section a rhythm rather than a wall of cards. */}
        <div className="mt-16 flex flex-col gap-16">
          {SHOWCASE.map((item, i) => (
            <div key={item.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className={i % 2 === 1 ? 'lg:order-2' : undefined}>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-muted">{item.body}</p>
              </div>
              <div className={i % 2 === 1 ? 'lg:order-1' : undefined}>{item.reel}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const REQUIREMENTS = [
  'Bun 1.3 or newer',
  'PostgreSQL 16 (the included Compose file runs one)',
  'A free Clerk application, for sign-in',
  'A domain whose DNS records you can edit',
  'For real delivery, a host that allows outbound port 25 (many cloud providers block it by default)',
];

const SEND_EXAMPLE = `curl -X POST http://localhost:5001/api/v1/send/message \\
  -H "X-Server-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "you@example.com",
    "from": "hello@yourdomain.com",
    "subject": "Hello from Posta",
    "plain_body": "It works."
  }'`;

const SETUP_STEPS: { title: string; body: React.ReactNode; code?: string }[] = [
  {
    title: 'Get the code',
    body: 'Clone the repository and install its dependencies.',
    code: `git clone ${REPO_URL}.git\ncd posta\nbun install`,
  },
  {
    title: 'Start PostgreSQL',
    body: (
      <>
        Or use a PostgreSQL 16 you already run, and point <Code>POSTA_MAIN_DB_URL</Code> at it.
      </>
    ),
    code: 'docker compose up -d postgres',
  },
  {
    title: 'Add your Clerk keys',
    body: (
      <>
        Create a free application at{' '}
        <a href="https://dashboard.clerk.com" className="text-accent hover:underline">
          dashboard.clerk.com
        </a>{' '}
        and copy its publishable and secret keys into <Code>.env</Code>. No webhook is needed.
      </>
    ),
    code: 'cp .env.example .env\n# then set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY',
  },
  {
    title: 'Start Posta',
    body: 'The first command runs the API, the SMTP server and the delivery worker, and creates the database tables. The second runs the dashboard on port 3000.',
    code: 'bun run start\n\n# in a second terminal\nbun run start:frontend',
  },
  {
    title: 'Create the admin account',
    body: (
      <>
        Open <Code>http://localhost:3000</Code> and create an account. The first one becomes the
        administrator, and the setup wizard walks you through your organisation, a mail server,
        your domain and its DNS records, and credentials.
      </>
    ),
  },
  {
    title: 'Send your first email',
    body: 'Create an API credential in the wizard, then send over HTTP, or use the SMTP credentials with any mail library.',
    code: SEND_EXAMPLE,
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative mt-4 rounded-xl border border-line bg-panel-2">
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
      <CopyButton value={code} label={label} className="absolute top-2 right-2" />
    </div>
  );
}

function Setup() {
  return (
    <section id="setup" className="scroll-mt-20 border-b border-line-soft">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Set up Posta
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            From a fresh clone to your first sent message. The setup wizard in the dashboard
            handles the email side and saves as you go, so you can stop at the DNS step and come
            back once the records resolve.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[18rem_1fr] lg:gap-14">
          <aside className="h-fit rounded-2xl border border-line bg-panel p-6 shadow-elev-sm lg:sticky lg:top-24">
            <h3 className="text-sm font-semibold text-foreground">You&apos;ll need</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-muted">
              {REQUIREMENTS.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line-soft pt-4 text-xs leading-relaxed text-faint">
              Trying it on a laptop? <Code>.env.example</Code> puts SMTP on port 2525, because
              binding port 25 needs root on Linux. Use 25 in production.
            </p>
          </aside>

          <ol className="flex min-w-0 flex-col gap-8">
            {SETUP_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
                  {step.code && <CodeBlock code={step.code} label={`${step.title} commands`} />}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function CtaBand({ firstRun }: { firstRun: boolean | null }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,var(--color-accent),transparent_60%)] opacity-[0.13]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {firstRun ? 'Ready when you are' : 'Send your first message today'}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
          {firstRun
            ? 'Create the admin account and the setup wizard takes it from there: organisation, server, domain, DNS and credentials.'
            : 'Verify a domain and you are sending. No message caps, no licence key, and the setup wizard walks the whole path.'}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PrimaryAction firstRun={firstRun} className={PRIMARY_CTA} />
          <a href={REPO_URL} className={SECONDARY_CTA}>
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-ink">
            <Mail size={13} strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-semibold text-foreground">Posta</span>
        </div>
        <p className="text-xs text-faint">Open source transactional email, MIT licensed.</p>
        <nav aria-label="Footer" className="ml-auto flex items-center gap-5 text-xs text-muted">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#setup" className="transition-colors hover:text-foreground">
            Set up
          </a>
          <a href={REPO_URL} className="transition-colors hover:text-foreground">
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
