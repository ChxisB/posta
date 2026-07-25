'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WizardState } from '../wizard-client';
import { createDomain, updateDomain, getDomains } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepDomain({ state, updateState, onNext, onBack }: Props) {
  const isExisting = !!state.domainId;
  const [name, setName] = useState(state.domainName || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allDomains, setAllDomains] = useState<any[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [nameTaken, setNameTaken] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      if (!state.orgPermalink || !state.serverId) return;
      try {
        const data = await getDomains(state.orgPermalink, String(state.serverId));
        setAllDomains(data.domains ?? []);
        if (data.domains?.length > 0) {
          const d = data.domains[0];
          setName(d.name ?? '');
          updateState({ domainId: d.id, domainName: d.name ?? '' });
        }
      } catch {}
      setPoolsLoading(false);
    }
    init();
  }, [state.orgPermalink, state.serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const checkName = useCallback((val: string) => {
    if (!val.trim()) return;
    const trimmed = val.trim().toLowerCase();
    const match = allDomains.find(
      (d) => d.name?.toLowerCase() === trimmed && d.id !== state.domainId
    );
    setNameTaken(!!match);
  }, [allDomains, state.domainId]);

  const handleNameChange = useCallback((val: string) => {
    setName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setNameTaken(false);
    debounceRef.current = setTimeout(() => checkName(val), 400);
  }, [checkName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.orgPermalink || !state.serverId || !name.trim() || nameTaken) return;

    if (isExisting) {
      setSaving(true);
      setError(null);
      try {
        const data = await updateDomain(state.orgPermalink, String(state.serverId), String(state.domainId), { name: name.trim() });
        const domain = data.domain;
        updateState({ domainName: domain.name ?? name.trim() });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to update domain');
      } finally {
        setSaving(false);
      }
    } else {
      setLoading(true);
      setError(null);
      try {
        const data = await createDomain(state.orgPermalink, String(state.serverId), { name: name.trim() });
        const domain = data.domain;
        updateState({ domainId: domain.id, domainName: domain.name });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to add domain');
      } finally {
        setLoading(false);
      }
    }
  };

  if (poolsLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const isUnchanged = isExisting && name === state.domainName;
  const canSubmit = name.trim() && !nameTaken && !isUnchanged;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {isExisting && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground">
            Editing domain &quot;{state.domainName}&quot;. Changes are saved when you continue.
          </p>
        </div>
      )}

      {!isExisting && (
        <p className="text-sm text-muted-foreground">
          Add a domain you own. You will need to configure DNS records in the next step.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Domain Name</label>
        <div className="relative">
          <input
            className="input w-full font-mono text-sm pr-10"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="example.com"
            required
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {nameTaken && <AlertTriangle className="h-4 w-4 text-destructive" />}
            {!nameTaken && name.trim() && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>
        </div>
        {nameTaken && (
          <p className="text-xs text-destructive mt-1">A domain with this name already exists in this server.</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          The domain you want to send or receive email from.
        </p>
      </div>
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading || saving || !canSubmit}>
          {(loading || saving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Adding...' : saving ? 'Saving...' : isExisting ? 'Save & Continue' : 'Add Domain & Continue'}
        </Button>
        {isExisting && (
          <Button type="button" variant="ghost" onClick={onNext}>
            Skip (unchanged)
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
      </div>
    </form>
  );
}
