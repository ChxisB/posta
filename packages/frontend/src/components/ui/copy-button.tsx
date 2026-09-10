'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Copy-to-clipboard for the values Posta asks operators to paste elsewhere:
 * DNS record contents, verification tokens, API keys, SMTP passwords.
 *
 * Every one of those flows had grown its own `copied` state and timeout. The
 * behaviour missing from all of them is the announcement: the confirmation
 * was a silent icon swap, so a screen-reader user got no feedback that the
 * copy had happened at all.
 */
export function CopyButton({
  value,
  label,
  className = '',
}: {
  value: string;
  /** What is being copied, e.g. "DKIM record". Becomes the accessible name. */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear on unmount: these buttons live inside steps that get swapped out
  // mid-timeout as the operator moves through the wizard.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused on insecure origins, which a self-hosted
      // Posta on plain HTTP will be. Leave the value selectable rather than
      // claiming a copy that did not happen.
      setCopied(false);
    }
  }

  return (
    <>
      <IconButton
        label={copied ? `${label} copied` : `Copy ${label}`}
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        className={className}
      >
        {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
      </IconButton>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </>
  );
}

/**
 * A value the operator is expected to copy verbatim: monospace, wrapping at
 * any character (DNS TXT records are long and have no spaces), with the copy
 * affordance attached.
 */
export function CopyableValue({
  value,
  label,
  className = '',
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <code className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-xs break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
