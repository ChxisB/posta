'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WizardState } from '../wizard-client';
import { createCredential, updateCredential, getCredentials } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepCredentials({ state, updateState, onNext, onBack }: Props) {
  const isExisting = !!state.credentialId;
  const [type, setType] = useState<'SMTP' | 'API'>(state.credentialType as 'SMTP' | 'API' || 'SMTP');
  const [name, setName] = useState(state.credentialName || '');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCred, setCreatedCred] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [allCreds, setAllCreds] = useState<any[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [nameTaken, setNameTaken] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      if (!state.orgPermalink || !state.serverId) return;
      try {
        const data = await getCredentials(state.orgPermalink, String(state.serverId));
        setAllCreds(data.credentials ?? []);
        if (data.credentials?.length > 0) {
          const c = data.credentials[0];
          setName(c.name ?? '');
          setType((c.type ?? 'SMTP') as 'SMTP' | 'API');
          updateState({ credentialId: c.id, credentialName: c.name ?? '', credentialType: c.type ?? 'SMTP' });
        }
      } catch {}
      setLoadingCreds(false);
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
    const match = allCreds.find(
      (c) => c.name?.toLowerCase() === trimmed && c.id !== state.credentialId
    );
    setNameTaken(!!match);
  }, [allCreds, state.credentialId]);

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
        const payload: any = { name: name.trim() };
        if (type) payload.type = type;
        const data = await updateCredential(state.orgPermalink, String(state.serverId), String(state.credentialId), payload);
        const cred = data.credential;
        updateState({ credentialName: cred.name ?? name.trim(), credentialType: cred.type ?? type });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to update credential');
      } finally {
        setSaving(false);
      }
    } else {
      setLoading(true);
      setError(null);
      try {
        const payload: any = { type, name: name.trim() };
        if (key.trim()) payload.key = key.trim();
        const data = await createCredential(state.orgPermalink, String(state.serverId), payload);
        const cred = data.credential;
        setCreatedCred(cred);
        updateState({ credentialId: cred.id, credentialName: cred.name, credentialType: cred.type });
      } catch (err: any) {
        setError(err.message || 'Failed to create credential');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCopyKey = async () => {
    if (!createdCred?.key) return;
    try {
      await navigator.clipboard.writeText(createdCred.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (loadingCreds) {
    return <div className="text-sm text-muted-foreground">Checking existing credentials...</div>;
  }

  // New credential created — show the key
  if (createdCred) {
    return (
      <div className="space-y-5 max-w-lg">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Credential created</p>
            <p className="text-sm text-muted-foreground">{createdCred.name} ({createdCred.type})</p>
          </div>
        </div>
        {createdCred.key && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Your API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 border break-all font-mono">
                {createdCred.key}
              </code>
              <Button variant="outline" size="icon-sm" onClick={handleCopyKey} title="Copy key">
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Save this key — it will not be shown again.
            </p>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onNext}>Continue</Button>
        </div>
      </div>
    );
  }

  const isUnchanged = isExisting && name === state.credentialName && type === state.credentialType;
  const canSubmit = name.trim() && !nameTaken && !isUnchanged;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {isExisting && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground">
            Editing credential &quot;{state.credentialName}&quot;. Changes are saved when you continue.
          </p>
        </div>
      )}

      {!isExisting && (
        <p className="text-sm text-muted-foreground">
          Create credentials to authenticate when sending email via SMTP or the API.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Type</label>
        <select className="input w-full" value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="SMTP">SMTP — for email clients and applications</option>
          <option value="API">API — for programmatic access</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Name</label>
        <div className="relative">
          <input
            className="input w-full pr-10"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Credential"
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
          <p className="text-xs text-destructive mt-1">A credential with this name already exists in this server.</p>
        )}
      </div>
      {!isExisting && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Key (optional)</label>
          <input
            className="input w-full font-mono text-sm"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="auto-generated if empty"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to auto-generate a secure key.
          </p>
        </div>
      )}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading || saving || !canSubmit}>
          {(loading || saving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Creating...' : saving ? 'Saving...' : isExisting ? 'Save & Continue' : 'Create & Continue'}
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
