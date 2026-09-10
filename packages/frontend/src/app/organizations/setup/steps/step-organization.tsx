'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { WizardState } from '../wizard-client';
import { createOrganization, updateOrganization, getOrganization } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StepIntro } from './step-intro';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function StepOrganization({ state, updateState, onNext }: Props) {
  const isExisting = !!state.orgId;
  const [name, setName] = useState(state.orgName || '');
  const [permalink, setPermalink] = useState(state.orgPermalink || '');
  const [autoSlug, setAutoSlug] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permalinkTaken, setPermalinkTaken] = useState(false);
  const [checkingPermalink, setCheckingPermalink] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const checkPermalink = useCallback(
    async (val: string) => {
      if (!val.trim() || val === state.orgPermalink) {
        setPermalinkTaken(false);
        return;
      }
      setCheckingPermalink(true);
      try {
        const data = await getOrganization(val);
        if (data.organization && data.organization.id !== state.orgId) {
          setPermalinkTaken(true);
        } else {
          setPermalinkTaken(false);
        }
      } catch {
        setPermalinkTaken(false);
      }
      setCheckingPermalink(false);
    },
    [state.orgId, state.orgPermalink],
  );

  const handlePermalinkChange = useCallback(
    (val: string) => {
      const slug = slugify(val);
      setAutoSlug(false);
      setPermalink(slug);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setPermalinkTaken(false);
      debounceRef.current = setTimeout(() => checkPermalink(slug), 400);
    },
    [checkPermalink],
  );

  const handleNameChange = useCallback(
    (val: string) => {
      setName(val);
      if (autoSlug) {
        const slug = slugify(val);
        setPermalink(slug);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setPermalinkTaken(false);
        debounceRef.current = setTimeout(() => checkPermalink(slug), 400);
      }
    },
    [autoSlug, checkPermalink],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !permalink.trim() || permalinkTaken) return;

    if (isExisting && state.orgId) {
      setSaving(true);
      setError(null);
      try {
        const data = await updateOrganization(String(state.orgId), {
          name: name.trim(),
          permalink: permalink.trim(),
        });
        const org = data.organization;
        updateState({
          orgName: org.name ?? name.trim(),
          orgPermalink: org.permalink ?? permalink.trim(),
        });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to update organization');
      } finally {
        setSaving(false);
      }
    } else {
      setLoading(true);
      setError(null);
      try {
        const data = await createOrganization({ name: name.trim(), permalink: permalink.trim() });
        const org = data.organization;
        updateState({ orgId: org.id, orgPermalink: org.permalink, orgName: org.name });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to create organization');
      } finally {
        setLoading(false);
      }
    }
  };

  const isUnchanged = isExisting && name === state.orgName && permalink === state.orgPermalink;
  const canSubmit = name.trim() && permalink.trim() && !permalinkTaken && !isUnchanged;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <StepIntro
        title="Create the organisation"
        next="Posta creates the organisation, then you'll add a mail server to it."
      >
        An organisation is the top-level container: it owns your mail servers, domains and
        credentials. Most setups need one per product, or one per customer you send on behalf of.
      </StepIntro>
      {isExisting && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-sm text-muted">
            Editing organization details. Changes are saved when you continue.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Organization Name</label>
        <Input
          className="w-full"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Organization"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Permalink</label>
        <div className="relative">
          <Input
            className="w-full font-mono text-sm pr-10"
            value={permalink}
            onChange={(e) => handlePermalinkChange(e.target.value)}
            placeholder="my-org"
            required
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {checkingPermalink && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            {!checkingPermalink && permalinkTaken && <AlertTriangle className="h-4 w-4 text-red" />}
            {!checkingPermalink && !permalinkTaken && permalink.trim() && (
              <CheckCircle2 className="h-4 w-4 text-green" />
            )}
          </div>
        </div>
        {permalinkTaken && (
          <p className="text-xs text-red mt-1">
            This permalink is already taken by another organization.
          </p>
        )}
        <p className="text-xs text-muted mt-1">
          Used in URLs and API routes. Auto-generated from the name.
        </p>
      </div>
      {error && <div className="text-sm text-red bg-red/10 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading || saving || !canSubmit}>
          {(loading || saving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading
            ? 'Creating...'
            : saving
              ? 'Saving...'
              : isExisting
                ? 'Save & Continue'
                : 'Create & Continue'}
        </Button>
        {isExisting && (
          <Button type="button" variant="ghost" onClick={onNext}>
            Skip (unchanged)
          </Button>
        )}
      </div>
    </form>
  );
}
