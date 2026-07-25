'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WizardState } from '../wizard-client';
import { createServer, updateServer, getServers, getIpPools } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepServer({ state, updateState, onNext, onBack }: Props) {
  const isExisting = !!state.serverId;
  const [name, setName] = useState(state.serverName || '');
  const [mode, setMode] = useState<'Live' | 'Development'>('Live');
  const [ipPoolId, setIpPoolId] = useState('');
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPools, setLoadingPools] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allServers, setAllServers] = useState<any[]>([]);
  const [nameTaken, setNameTaken] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load IP pools and server list (for uniqueness check) from API
  useEffect(() => {
    async function init() {
      if (!state.orgPermalink) return;
      try {
        const [serverData, poolData] = await Promise.allSettled([
          getServers(state.orgPermalink),
          getIpPools(),
        ]);
        if (serverData.status === 'fulfilled') {
          setAllServers(serverData.value.servers ?? []);
        }
        if (poolData.status === 'fulfilled') {
          setPools(poolData.value.ip_pools ?? []);
        }
      } catch {}
      setLoadingPools(false);
    }
    init();
  }, [state.orgPermalink]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const checkName = useCallback((val: string) => {
    if (!val.trim()) return;
    const trimmed = val.trim().toLowerCase();
    const match = allServers.find(
      (s) => s.name?.toLowerCase() === trimmed && s.id !== state.serverId
    );
    setNameTaken(!!match);
  }, [allServers, state.serverId]);

  const handleNameChange = useCallback((val: string) => {
    setName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setNameTaken(false);
    debounceRef.current = setTimeout(() => checkName(val), 400);
  }, [checkName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.orgPermalink || !name.trim() || nameTaken) return;

    if (isExisting) {
      setSaving(true);
      setError(null);
      try {
        const payload: any = { name: name.trim() };
        if (ipPoolId) payload.ip_pool_id = Number(ipPoolId);
        const data = await updateServer(state.orgPermalink, String(state.serverId), payload);
        const server = data.server;
        updateState({ serverName: server.name ?? name.trim() });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to update server');
      } finally {
        setSaving(false);
      }
    } else {
      setLoading(true);
      setError(null);
      try {
        const payload: any = { name: name.trim(), mode };
        if (ipPoolId) payload.ip_pool_id = Number(ipPoolId);
        const data = await createServer(state.orgPermalink, payload);
        const server = data.server;
        updateState({ serverId: server.id, serverName: server.name });
        onNext();
      } catch (err: any) {
        setError(err.message || 'Failed to create server');
      } finally {
        setLoading(false);
      }
    }
  };

  const isUnchanged = isExisting && name === state.serverName;
  const canSubmit = name.trim() && !nameTaken && !isUnchanged;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {isExisting && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground">
            Editing server &quot;{state.serverName}&quot;. Changes are saved when you continue.
          </p>
        </div>
      )}

      {!isExisting && (
        <p className="text-sm text-muted-foreground">
          Create your first mail server. You can add more servers later.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Server Name</label>
        <div className="relative">
          <input
            className="input w-full pr-10"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Server"
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
          <p className="text-xs text-destructive mt-1">A server with this name already exists in this organization.</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Mode</label>
        <select className="input w-full" value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="Live">Live</option>
          <option value="Development">Development</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Use Development mode for testing — messages are not actually sent.
        </p>
      </div>
      {pools.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1.5">IP Pool</label>
          <select className="input w-full" value={ipPoolId} onChange={(e) => setIpPoolId(e.target.value)}>
            <option value="">Default / None</option>
            {pools.map((pool: any) => (
              <option key={pool.id} value={pool.id}>{pool.name}</option>
            ))}
          </select>
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
