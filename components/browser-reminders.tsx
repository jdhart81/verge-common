'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
const subscribe = () => () => {};
const availableNow = () =>
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;
export function BrowserReminders() {
  const available = useSyncExternalStore(subscribe, availableNow, () => false);
  const [message, setMessage] = useState(''),
    [mode, setMode] = useState('updates'),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.ready
        .then((r) => r.pushManager?.getSubscription())
        .then((s) => setEnabled(!!s))
        .catch(() => {});
  }, []);
  async function change(action: 'enable' | 'disable' | 'test') {
    setBusy(true);
    setMessage('');
    try {
      const r = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await r.pushManager.getSubscription();
      if (action === 'enable') {
        const config = await fetch('/api/push');
        const v = (await config.json()) as {
          publicKey: string;
          error?: string;
        };
        if (!config.ok)
          throw new Error(v.error || 'Reminders are unavailable on this host.');
        subscription ??= await r.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: v.publicKey,
        });
      }
      if (!subscription)
        throw new Error('Enable reminders on this browser first.');
      const response = await fetch(
        `/api/push${action === 'test' ? '/test' : ''}`,
        {
          method: action === 'disable' ? 'DELETE' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON(), mode }),
        },
      );
      const v = (await response.json()) as { error?: string; message?: string };
      if (!response.ok)
        throw new Error(
          v.error || v.message || 'Reminders could not be updated.',
        );
      if (action === 'disable') await subscription.unsubscribe();
      setEnabled(action !== 'disable');
      setMessage(
        v.message ||
          (action === 'disable'
            ? 'Reminders disabled on this browser.'
            : 'Reminders enabled. Use Send test and check your device.'),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mt-5">
      <h2>Come back when it matters</h2>
      <p>
        Opt in to reminders for approvals, discussion replies, activity changes
        and due care actions. Messages show no private co-op details. Your
        browser provider processes the encrypted delivery; account deletion
        removes saved subscriptions.
      </p>
      {available ? (
        <>
          <label>
            Reminder frequency
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="updates">
                Activity updates · at most three per day
              </option>
              <option value="digest">
                Weekly digest · when there is something to review
              </option>
            </select>
          </label>
          <div className="button-row mt-3">
            <Button disabled={busy} onClick={() => change('enable')}>
              {enabled
                ? 'Save reminder preference'
                : 'Enable browser reminders'}
            </Button>
            {enabled && (
              <>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => change('test')}
                >
                  Send test
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => change('disable')}
                >
                  Disable on this browser
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <p>
          This browser does not offer push reminders. On iPhone or iPad, add
          VergeCommon to your Home Screen, then open it there. You can always
          check your co-ops directly.
        </p>
      )}
      <p className="small">
        Delivery depends on your device and browser permissions. The app does
        not email you. Your open workspace still refreshes automatically.
      </p>
      <output>{message}</output>
    </section>
  );
}
