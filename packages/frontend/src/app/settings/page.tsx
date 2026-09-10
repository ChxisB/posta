'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/providers/toast-provider';

export default function SettingsPage() {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = (await getSettings()).user ?? {};
        if (cancelled) return;
        setFirstName(user.first_name ?? '');
        setLastName(user.last_name ?? '');
        setTimeZone(user.time_zone ?? '');
      } catch (err) {
        if (!cancelled) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        time_zone: timeZone || undefined,
      });
      toast('success', 'Settings saved.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save your settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your profile and how Posta looks for you." />

      <div className="flex max-w-xl flex-col gap-5">
        <Card>
          <CardHeader
            title="Profile"
            description="How your name appears on activity across every organisation."
          />
          <CardBody>
            {loading ? (
              <SkeletonRows count={3} height="h-11" />
            ) : loadError ? (
              <ErrorState error={loadError} what="your settings" retryHref="/settings" />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="First name">
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </Field>
                </div>
                <Field
                  label="Time zone"
                  hint="An IANA name, such as Europe/London. Timestamps are shown in this zone."
                >
                  <Input
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    placeholder="UTC"
                  />
                </Field>
              </div>
            )}
          </CardBody>
          {!loading && !loadError && (
            <CardFooter>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Save changes
              </Button>
            </CardFooter>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Appearance"
            description="Stored in this browser, not on your account."
          />
          <CardBody className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted">Switch between the light and dark palette.</p>
            <ThemeToggle />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
