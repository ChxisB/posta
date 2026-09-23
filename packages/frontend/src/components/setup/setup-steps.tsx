import { cn } from '@/lib/utils';

/**
 * What the setup wizard (organizations/setup) will ask for, shown on the
 * first-run pages: the setup screen at "/" and /sign-up. Mirrors the
 * wizard's required steps.
 */
export const SETUP_STEPS = [
  { title: 'Name your organisation', detail: 'Everything else you set up lives inside it.' },
  {
    title: 'Create a mail server',
    detail: 'Usually one per app, each with its own credentials and send limits.',
  },
  { title: 'Add your sending domain', detail: 'The domain your emails will come from.' },
  {
    title: 'Publish its DNS records',
    detail: 'Posta generates SPF, DKIM and MX, then checks them until they resolve.',
  },
  { title: 'Get SMTP or API credentials', detail: 'Drop them into your app and start sending.' },
];

/** The AuthSplit side panel on a fresh installation. */
export function SetupSteps() {
  return (
    <div className="max-w-md">
      <p className="text-xs font-semibold tracking-wide text-accent uppercase">What happens next</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance xl:text-4xl">
        From a fresh install to your first email
      </h2>
      <p className="mt-4 text-base leading-relaxed text-muted">
        The setup wizard walks you through each step and saves as you go, so you can stop and come
        back.
      </p>

      <ol className="mt-10">
        {SETUP_STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The rail joining each number to the next. */}
            {i < SETUP_STEPS.length - 1 && (
              <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-line" />
            )}
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-panel text-sm font-semibold text-accent shadow-elev-sm">
              {i + 1}
            </span>
            <div className="pt-1">
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The same steps as a short list, for below `lg`, where AuthSplit hides its
 * side panel and SetupSteps with it.
 */
export function SetupStepsCompact({ className }: { className?: string }) {
  return (
    <ol className={cn('grid gap-2 text-sm text-muted lg:hidden', className)}>
      {SETUP_STEPS.map((step, i) => (
        <li key={step.title} className="flex items-center gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
            {i + 1}
          </span>
          {step.title}
        </li>
      ))}
    </ol>
  );
}
