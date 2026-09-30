'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BrowserReminders } from '@/components/browser-reminders';
import { Button } from '@/components/ui/button';
import { ControlLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
const subscribeSource = (change: () => void) => {
  window.addEventListener('popstate', change);
  return () => window.removeEventListener('popstate', change);
};
const sourceNow = () => {
  const v = new URLSearchParams(location.search).get('ref') ?? '';
  return /^[0-9a-f-]{36}$/.test(v) ? v : '';
};
export function ActivityJoin({
  coopId,
  path,
  signedIn,
}: {
  coopId: string;
  path: string;
  signedIn: boolean;
}) {
  const referral = useSyncExternalStore(subscribeSource, sourceNow, () => '');
  const returnPath = referral ? `${path}?ref=${referral}` : path;
  const [status, setStatus] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const requestId = useRef('');
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch(`/api/workspaces?id=${coopId}`)
      .then(async (r) => {
        if (r.ok && active) {
          const v = (await r.json()) as {
            state?: unknown;
            membershipStatus?: string;
            error?: string;
          };
          setStatus(v.state ? 'active' : (v.membershipStatus ?? ''));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [coopId, signedIn]);
  if (!signedIn)
    return (
      <Link
        className="button primary mt-5"
        target="_top"
        href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnPath)}`}
      >
        Sign in to take part
      </Link>
    );
  if (status)
    return (
      <div className="notice mt-5">
        <p>
          {status === 'active'
            ? 'You’re a member. Open the co-op to respond and see meeting instructions.'
            : status === 'pending'
              ? 'Your request is waiting for a steward. Return to this activity or your co-ops to check approval.'
              : 'Your previous membership is no longer active. Contact a steward.'}
        </p>
        <Link
          className="button primary"
          href={`/workspace/?coop=${coopId}&activity=${encodeURIComponent(path)}`}
        >
          Open this co-op
        </Link>
        {status === 'pending' && <BrowserReminders />}
      </div>
    );
  return (
    <form
      className="action-form mt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const name = new FormData(e.currentTarget).get('name');
        setBusy(true);
        setMessage('');
        requestId.current ||= crypto.randomUUID();
        try {
          const r = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: coopId,
              op: 'request_membership',
              payload: { name, activity: path, referral },
              requestId: requestId.current,
            }),
          });
          const v = (await r.json()) as {
            state?: unknown;
            membershipStatus?: string;
            error?: string;
          };
          if (!r.ok)
            throw new Error(v.error || 'Your request could not be saved.');
          setStatus('pending');
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ControlLabel>
        Your member name
        <Input name="name" required maxLength={80} />
      </ControlLabel>
      {referral && (
        <p className="small">
          Joining records this shared-link source privately in the co-op’s
          participation report.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Request to join this activity’s co-op'}
      </Button>
      <p role="alert">{message}</p>
    </form>
  );
}
