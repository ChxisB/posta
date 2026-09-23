import Link from 'next/link';
import { Mail } from 'lucide-react';
import { DeliveryReel } from '@/components/reels/delivery-reel';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

/**
 * The frame for the signed-out pages ("/", /login and /sign-up): a brand
 * panel on the left and the form on the right. The panel carries whatever
 * explains the page (the delivery reel by default, the setup steps on a
 * fresh installation), so the form column can stay short and do one job.
 *
 * Below `lg` the panel is dropped and the form stands alone, with the brand
 * mark moved into its top bar.
 */
export function AuthSplit({
  aside = <AuthShowcase />,
  children,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line-soft bg-panel-2 lg:flex lg:flex-col">
        {/* An accent wash pulled into the corner, over a dot grid that fades
            out before it reaches the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,var(--color-accent),transparent_55%)] opacity-[0.14]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_30%_45%,black,transparent_75%)] [background-size:22px_22px]"
        />

        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <BrandMark />
          <div className="my-auto py-12">{aside}</div>
          <p className="text-xs text-faint">Free and open source · MIT licensed · self-hosted</p>
        </div>
      </aside>

      <main id="main" className="flex min-h-screen flex-col px-4 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center">
          <BrandMark className="lg:hidden" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('inline-flex items-center gap-2.5 self-start text-foreground', className)}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink shadow-elev-sm">
        <Mail size={17} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">Posta</span>
    </Link>
  );
}

/** The default panel: the headline and delivery reel posta-site leads with. */
function AuthShowcase() {
  return (
    <div>
      <h2 className="max-w-md text-3xl font-bold tracking-tight text-balance xl:text-4xl">
        Transactional email <span className="text-accent">you run yourself</span>
      </h2>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
        Every message your apps send, on servers you own, with the full story of where each one
        went.
      </p>
      <div className="mt-10">
        <DeliveryReel />
      </div>
    </div>
  );
}
