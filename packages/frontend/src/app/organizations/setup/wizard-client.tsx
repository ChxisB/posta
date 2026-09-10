'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import StepOrganization from './steps/step-organization';
import StepServer from './steps/step-server';
import StepDomain from './steps/step-domain';
import StepDns from './steps/step-dns';
import StepCredentials from './steps/step-credentials';
import StepSending from './steps/step-sending';
import StepTestSend from './steps/step-test-send';
import StepSummary from './steps/step-summary';

export type WizardStep =
  | 'organization'
  | 'server'
  | 'domain'
  | 'dns'
  | 'credentials'
  | 'sending'
  | 'test-send'
  | 'summary';

export interface WizardState {
  orgId: number | null;
  orgPermalink: string | null;
  orgName: string;
  serverId: number | null;
  serverName: string;
  domainId: number | null;
  domainName: string;
  credentialId: number | null;
  credentialName: string;
  credentialType: string;
  testSent: boolean;
}

const STEPS: { key: WizardStep; label: string; optional?: boolean }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'server', label: 'Server' },
  { key: 'domain', label: 'Domain' },
  { key: 'dns', label: 'DNS' },
  { key: 'credentials', label: 'Credentials' },
  // Sending direction defaults to outgoing and a test send proves nothing
  // the rest of the setup has not already configured, so both can be skipped
  // without leaving the server in a broken state.
  { key: 'sending', label: 'Direction', optional: true },
  { key: 'test-send', label: 'Test send', optional: true },
  { key: 'summary', label: 'Summary' },
];

const STEP_ORDER: WizardStep[] = STEPS.map((s) => s.key);

const STORAGE_KEY_PREFIX = 'posta:wizard:';

/**
 * The wizard is explicitly resumable: DNS propagation can take a day, so an
 * operator is expected to leave part-way and come back. Progress is keyed by
 * permalink so two half-finished organisations don't overwrite each other.
 */
function loadSaved(permalink: string): { step: WizardStep; state: WizardState } | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${permalink}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveToDisk(permalink: string, step: WizardStep, state: WizardState) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${permalink}`, JSON.stringify({ step, state }));
  } catch {}
}

function clearSaved(permalink: string) {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${permalink}`);
  } catch {}
}

interface PreloadedOrg {
  orgId: number | null;
  orgPermalink: string | null;
  orgName: string;
  serverId: number | null;
  serverName: string;
  serverCount: number;
  domainCount: number;
  verifiedCount: number;
  credentialCount: number;
  routeCount: number;
}

interface Props {
  initialOrgPermalink: string | null;
  preloaded: PreloadedOrg | null;
}

function firstIncompleteStep(p: PreloadedOrg): WizardStep {
  if (p.serverCount === 0) return 'server';
  if (p.domainCount === 0) return 'domain';
  if (p.verifiedCount === 0) return 'dns';
  if (p.credentialCount === 0) return 'credentials';
  return 'sending';
}

export default function SetupWizardClient({ initialOrgPermalink, preloaded }: Props) {
  const router = useRouter();

  const initialData = preloaded ?? {
    orgId: null,
    orgPermalink: initialOrgPermalink,
    orgName: '',
    serverId: null,
    serverName: '',
    serverCount: 0,
    domainCount: 0,
    verifiedCount: 0,
    credentialCount: 0,
    routeCount: 0,
  };

  const [step, setStep] = useState<WizardStep>(() =>
    initialData.orgPermalink ? firstIncompleteStep(initialData) : 'organization',
  );

  const [state, setState] = useState<WizardState>({
    orgId: initialData.orgId,
    orgPermalink: initialData.orgPermalink,
    orgName: initialData.orgName,
    serverId: initialData.serverId,
    serverName: initialData.serverName,
    domainId: null,
    domainName: '',
    credentialId: null,
    credentialName: '',
    credentialType: '',
    testSent: false,
  });

  // A saved session is more current than the server preload, so it wins.
  // Runs once: after this the persist effect below owns the stored value.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const permalink = state.orgPermalink;
    if (!permalink) return;
    const saved = loadSaved(permalink);
    if (saved) {
      setState(saved.state);
      setStep(saved.step);
    }
  }, [state.orgPermalink]);

  useEffect(() => {
    if (!state.orgPermalink) return;
    saveToDisk(state.orgPermalink, step, state);
  }, [state, step]);

  const orgExists = !!state.orgPermalink;

  const updateState = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const goNext = useCallback(() => {
    setStep((prev) => {
      const idx = STEP_ORDER.indexOf(prev);
      return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : prev;
    });
  }, []);

  const goBack = useCallback(() => {
    setStep((prev) => {
      const idx = STEP_ORDER.indexOf(prev);
      if (idx <= 0) return prev;
      const candidate = STEP_ORDER[idx - 1];
      // Once the organisation exists, step 1 has nothing left to do, so Back
      // skips over it rather than showing a form that would create a second.
      if (candidate === 'organization' && orgExists) {
        return idx - 2 >= 0 ? STEP_ORDER[idx - 2] : prev;
      }
      return candidate;
    });
  }, [orgExists]);

  const currentIdx = STEP_ORDER.indexOf(step);

  /**
   * Each step owns its own Back/Next buttons, because most of them create
   * something through the API before advancing and only the step knows
   * whether that succeeded. So this renders the rail and the frame and
   * leaves navigation to the step, rather than using the shared Wizard
   * primitive whose footer drives the transitions itself.
   */
  const stepProps = { state, updateState, onNext: goNext, onBack: goBack };

  return (
    <>
      <PageHeader
        title="Setup wizard"
        description={
          state.orgName
            ? `Configuring ${state.orgName}. Five required steps, two optional. Progress saves as you go, so you can stop at any point and pick up where you left off.`
            : 'Takes a new organisation all the way to a verified, sending domain. Five required steps, two optional — progress saves as you go, so you can stop at any point and come back.'
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <nav aria-label="Setup steps" className="shrink-0 lg:w-52">
          <ol className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:flex-col lg:overflow-visible lg:pb-0">
            {STEPS.map((s, i) => {
              const isCurrent = s.key === step;
              const isPast = i < currentIdx;
              // The organisation step is complete by definition when the
              // wizard was opened against an existing organisation.
              const isSkipped = s.key === 'organization' && orgExists;
              const reachable = isPast || isCurrent || isSkipped;
              const complete = isPast || isSkipped;

              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => reachable && !isCurrent && setStep(s.key)}
                    disabled={!reachable || isCurrent}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Step ${i + 1}: ${s.label}`}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isCurrent
                        ? 'bg-accent/10 font-medium text-accent'
                        : reachable
                          ? 'cursor-pointer text-muted hover:bg-panel-2 hover:text-foreground'
                          : 'text-faint/50',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-bold',
                        isCurrent
                          ? 'bg-accent text-accent-ink'
                          : complete
                            ? 'bg-green/15 text-green'
                            : 'bg-panel-2 text-faint',
                      )}
                    >
                      {complete ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.label}</span>
                    {s.optional && !complete && (
                      <span className="ml-auto hidden text-2xs text-faint lg:inline">optional</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 flex-1">
          <Card padded>
            <div className="flex items-center gap-2 border-b border-line-soft pb-4">
              <Sparkles size={15} className="text-accent" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">{STEPS[currentIdx]?.label}</h2>
              <span className="ml-auto text-xs tabular-nums text-faint">
                Step {currentIdx + 1} of {STEPS.length}
              </span>
            </div>

            {step === 'organization' && (
              <StepOrganization state={state} updateState={updateState} onNext={goNext} />
            )}
            {step === 'server' && <StepServer {...stepProps} />}
            {step === 'domain' && <StepDomain {...stepProps} />}
            {step === 'dns' && <StepDns {...stepProps} />}
            {step === 'credentials' && <StepCredentials {...stepProps} />}
            {step === 'sending' && <StepSending {...stepProps} />}
            {step === 'test-send' && <StepTestSend {...stepProps} />}
            {step === 'summary' && (
              <StepSummary
                state={state}
                onFinish={() => {
                  if (state.orgPermalink) clearSaved(state.orgPermalink);
                  router.push('/organizations');
                }}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
