'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'server', label: 'Server' },
  { key: 'domain', label: 'Domain' },
  { key: 'dns', label: 'DNS Setup' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'sending', label: 'Sending Direction' },
  { key: 'test-send', label: 'Test Send' },
  { key: 'summary', label: 'Summary' },
];

const STEP_ORDER: WizardStep[] = STEPS.map((s) => s.key);

const STORAGE_KEY_PREFIX = 'posta:wizard:';

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

  // Build initial state from preloaded data or defaults
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

  const [step, setStep] = useState<WizardStep>(() => {
    if (initialData.orgPermalink) {
      return firstIncompleteStep(initialData);
    }
    return 'organization';
  });

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

  // Restore from localStorage if it exists (overrides preloaded data for resumed sessions)
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist state to localStorage
  useEffect(() => {
    if (!state.orgPermalink) return;
    saveToDisk(state.orgPermalink, step, state);
  }, [state, step]);

  const orgExists = !!state.orgPermalink;

  const updateState = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const goToStep = useCallback((s: WizardStep) => {
    setStep(s);
  }, []);

  const goNext = useCallback(() => {
    setStep((prev) => {
      const idx = STEP_ORDER.indexOf(prev);
      if (idx < STEP_ORDER.length - 1) return STEP_ORDER[idx + 1];
      return prev;
    });
  }, []);

  const goBack = useCallback(() => {
    setStep((prev) => {
      const idx = STEP_ORDER.indexOf(prev);
      if (idx <= 0) return prev;
      const candidate = STEP_ORDER[idx - 1];
      if (candidate === 'organization' && orgExists) {
        if (idx - 2 >= 0) return STEP_ORDER[idx - 2];
        return prev;
      }
      return candidate;
    });
  }, [orgExists]);

  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Setup Wizard</h1>
          <p className="text-sm text-muted-foreground">
            {state.orgName
              ? `Configuring ${state.orgName}`
              : 'Get your organization ready to send and receive email'}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <nav className="lg:w-56 shrink-0">
          <div className="lg:sticky lg:top-8 space-y-1">
            {STEPS.map((s, i) => {
              const isCurrent = s.key === step;
              const isPast = i < currentIdx;
              const isSkipped = s.key === 'organization' && orgExists;
              const isDisabled = !isPast && !isCurrent && !isSkipped;

              return (
                <button
                  key={s.key}
                  onClick={() => {
                    if (isCurrent || isDisabled) return;
                    goToStep(s.key);
                  }}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-left transition-all',
                    isCurrent
                      ? 'bg-primary/10 text-primary font-medium'
                      : isSkipped || isPast
                        ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer'
                        : 'text-muted-foreground/40 cursor-not-allowed'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isSkipped || isPast
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground/40'
                    )}
                  >
                    {(isSkipped || isPast) ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {STEPS.find((s) => s.key === step)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {step === 'organization' && (
                <StepOrganization
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                />
              )}
              {step === 'server' && (
                <StepServer
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'domain' && (
                <StepDomain
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'dns' && (
                <StepDns
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'credentials' && (
                <StepCredentials
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'sending' && (
                <StepSending
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'test-send' && (
                <StepTestSend
                  state={state}
                  updateState={updateState}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 'summary' && (
                <StepSummary
                  state={state}
                  onFinish={() => {
                    if (state.orgPermalink) clearSaved(state.orgPermalink);
                    router.push(`/organizations`);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
