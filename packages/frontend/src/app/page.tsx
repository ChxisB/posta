import Link from 'next/link';
import { Show } from '@clerk/nextjs';
import {
  ArrowRight,
  BarChart3,
  Code2,
  GitBranch,
  Globe,
  Inbox,
  Mail,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { SkipLink } from '@/components/ui/skip-link';
import { DeliveryReel } from '@/components/reels/delivery-reel';
import { BounceReel, DnsReel, WebhookReel } from '@/components/reels/feature-reels';

/**
 * Public marketing site for Posta ("/"). Rendered bare, with no dashboard
 * shell — see components/shell/app-shell.tsx.
 *
 * Shares the token layer with the dashboard, so it is unmistakably the same
 * product, but it is the one place allowed to spend on presentation: an
 * accent wash behind the hero, a larger type scale, and generous vertical
 * rhythm. The dashboard stays flat and dense on purpose — an operator
 * reading delivery failures at 2am is not the same audience as someone
 * deciding whether to try this at all.
 *
 * Previously "/" was a three-line redirect to /organizations, so a signed-out
 * visitor was bounced straight into an app they had no account for.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink href="#main">Skip to content</SkipLink>
      <SiteNav />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
            <Mail size={17} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">Posta</span>
        </Link>

        <nav
          aria-label="Site"
          className="ml-8 hidden items-center gap-6 text-sm text-muted md:flex"
        >
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Show
            when="signed-in"
            fallback={
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-[filter] hover:brightness-95 dark:hover:brightness-110"
                >
                  Get started
                </Link>
              </>
            }
          >
            <Link
              href="/organizations"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-[filter] hover:brightness-95 dark:hover:brightness-110"
            >
              Go to dashboard <ArrowRight size={15} aria-hidden />
            </Link>
          </Show>
        </div>
      </div>
    </header>
  );
}

function Hero() {
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
          Sub-second handoff · full delivery history · open source, MIT
        </p>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Transactional email, <span className="text-accent">delivered in under a second</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Password resets, one-time codes and receipts, handed to the recipient&apos;s mail server
          in under a second at the median. Warm connection pools, IP pools you control, and a full
          delivery history for every single message.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Show
            when="signed-in"
            fallback={
              <>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-elev-md transition-[filter] hover:brightness-95 dark:hover:brightness-110"
                >
                  Get started <ArrowRight size={16} aria-hidden />
                </Link>
              </>
            }
          >
            <Link
              href="/organizations"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-elev-md transition-[filter] hover:brightness-95 dark:hover:brightness-110"
            >
              Go to dashboard <ArrowRight size={16} aria-hidden />
            </Link>
          </Show>
          <a
            href="#how"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-panel px-6 text-sm font-semibold text-foreground shadow-elev-sm transition-colors hover:bg-panel-2"
          >
            See how it works
          </a>
        </div>

        <p className="mt-5 text-xs text-faint">
          Free and open source. No message caps, no licence key.
        </p>

        {/* The reel carries the claim the headline makes. A duration cannot
            be shown in a screenshot, so this is the one thing on the page
            that actually demonstrates rather than asserts. */}
        <div className="mt-14 flex justify-center">
          <DeliveryReel />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Mail,
    title: 'Transactional sending',
    body: 'SMTP and a REST API over the same pipeline. Per-server credentials, IP pools, and daily limits you control.',
  },
  {
    icon: Inbox,
    title: 'Inbound routing',
    body: 'Accept mail for your domains and forward it to an HTTP endpoint or another SMTP host. Routes decide what happens to each address.',
  },
  {
    icon: ShieldCheck,
    title: 'Deliverability built in',
    body: 'SPF, DKIM and MX generated per domain with live verification, and IP pools you assign per server. Reputation is the difference between a second and an hour.',
  },
  {
    icon: BarChart3,
    title: 'Delivery you can inspect',
    body: 'Every message keeps its full delivery history — attempts, remote responses, bounce reasons — not just a status word.',
  },
  {
    icon: Webhook,
    title: 'Webhooks for everything',
    body: 'MessageSent, MessageDelayed, MessageDeliveryFailed and MessageHeld, delivered to your endpoint with retries.',
  },
  {
    icon: Globe,
    title: 'Open source, self-hosted',
    body: 'MIT licensed. Run it on your own servers, inside your own network, with no licence keys, message caps or phone-home.',
  },
];

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
    body: 'Every delivery event is posted to your endpoint and retried with backoff when it fails. The happy path is table stakes; what matters is that an outage on your side does not cost you the events.',
    reel: <WebhookReel />,
  },
];

function Features() {
  return (
    <section id="features" className="border-b border-line-soft">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built for mail that cannot be late
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            A one-time code that arrives in thirty seconds has already failed. Everything here is
            built around the tail, not the average.
          </p>
        </div>

        {/* Three mechanisms that a sentence cannot convey: DNS propagating,
            a bounce becoming a suppression, a webhook recovering. Alternating
            sides gives the section a rhythm rather than a wall of cards. */}
        <div className="mt-16 flex flex-col gap-16">
          {SHOWCASE.map((item, i) => (
            <div
              key={item.title}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
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

        <ul className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-line bg-panel p-7 shadow-elev-sm transition-shadow hover:shadow-elev-md"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon size={20} strokeWidth={2} aria-hidden />
              </span>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: GitBranch,
    title: 'Create an organisation',
    body: 'One organisation per product or customer, with as many sending servers underneath as you need.',
  },
  {
    icon: Globe,
    title: 'Verify a domain',
    body: 'Posta generates the SPF, DKIM and MX records. Publish them, and it tells you which have propagated and which have not — rather than failing silently later.',
  },
  {
    icon: Code2,
    title: 'Point your app at it',
    body: 'Use the SMTP credentials in an existing mail library, or the REST API with an API key. Nothing about your application code has to become Posta-shaped.',
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-b border-line-soft bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Sending in three steps
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            The setup wizard walks through all of it and saves as you go, so you can stop at the DNS
            step and come back once the records resolve.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-2xl border border-line bg-panel p-7 shadow-elev-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">
                  {i + 1}
                </span>
                <Icon size={18} className="text-faint" aria-hidden />
              </div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,var(--color-accent),transparent_60%)] opacity-[0.13]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Send your first message today
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
          Verify a domain and you are sending. No message caps, no licence key, and the setup
          wizard walks the whole path.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Show
            when="signed-in"
            fallback={
              <>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-elev-md transition-[filter] hover:brightness-95 dark:hover:brightness-110"
                >
                  Get started <ArrowRight size={16} aria-hidden />
                </Link>
              </>
            }
          >
            <Link
              href="/organizations/setup"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink shadow-elev-md transition-[filter] hover:brightness-95 dark:hover:brightness-110"
            >
              Open the setup wizard <ArrowRight size={16} aria-hidden />
            </Link>
          </Show>
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
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <Link href="/help" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <a
            href="https://github.com/ChxisB/posta"
            className="transition-colors hover:text-foreground"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
