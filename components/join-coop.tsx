'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function JoinCoop({ signedIn }: { signedIn: boolean }) {
  const [invite, setInvite] = useState(''),
    [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const requestId = useRef('');
  useEffect(() => {
    setInvite(location.hash.slice(1));
    requestId.current = crypto.randomUUID();
  }, []);
  return (
    <main className="wrap network">
      <a className="brand" href="/network/">
        verge common
      </a>
      <section className="panel mt-8">
        <p className="eyebrow">A PLACE FOR YOU</p>
        <h1>Join a conservation co-op</h1>
        <p>
          This single-use invitation lets you request membership in a private or
          public group. A steward reviews your request before you can see
          private records.
        </p>
        {!signedIn ? (
          <>
            <a
              className="button primary"
              target="_top"
              href="/signin-with-chatgpt?return_to=/join/"
            >
              Sign in
            </a>
            <p>
              After signing in, reopen your original invitation link to
              continue.
            </p>
          </>
        ) : done ? (
          <>
            <p role="status">
              Your request is saved. A steward can now approve it.
            </p>
            <a className="button primary" href="/workspace/">
              My co-ops
            </a>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              try {
                const [id, token] = invite.split('.');
                const r = await fetch('/api/invitations', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    action: 'accept',
                    id,
                    token,
                    name,
                    requestId: requestId.current,
                  }),
                });
                const v: any = await r.json();
                if (!r.ok) throw new Error(v.error);
                history.replaceState(null, '', '/join/');
                setDone(true);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your member name
              <Input
                value={name}
                maxLength={80}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Button className="mt-4" disabled={busy || !invite}>
              {busy ? 'Saving…' : 'Request to join'}
            </Button>
            {!invite && (
              <p>Open the complete invitation link shared by your steward.</p>
            )}
            <p role="alert">{message}</p>
          </form>
        )}
      </section>
    </main>
  );
}
