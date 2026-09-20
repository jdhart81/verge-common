'use client';
import { BrandLogo } from '@/components/brand-logo';
import { ControlLabel } from '@/components/ui/label';
import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  clearInvitation,
  invitationForJoin,
  invitationSignInPath,
  rememberInvitation,
  validInvitation,
} from '@/lib/invitation-handoff.mjs';
const invitationChanged = 'vergecommon-invitation-changed';
function invitationStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
function subscribeInvitation(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener(invitationChanged, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener(invitationChanged, onChange);
  };
}
const readInvitation = () =>
  invitationForJoin(location.hash, invitationStorage());
const serverInvitation = () => '';
export function JoinCoop({ signedIn }: { signedIn: boolean }) {
  const invite = useSyncExternalStore(
    subscribeInvitation,
    readInvitation,
    serverInvitation,
  );
  const [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [remembered, setRemembered] = useState(false),
    [needsSignIn, setNeedsSignIn] = useState(false);
  const requestId = useRef({ invitation: '', value: '' });
  useEffect(() => {
    const remember = () => {
      const storage = invitationStorage();
      if (location.hash) {
        setDone(false);
        setMessage('');
      }
      if (location.hash && !validInvitation(location.hash.slice(1))) {
        clearInvitation(storage);
        setRemembered(false);
      } else {
        const pending = readInvitation();
        if (!pending) clearInvitation(storage);
        setRemembered(rememberInvitation(storage, pending));
      }
      window.dispatchEvent(new Event(invitationChanged));
    };
    remember();
    window.addEventListener('hashchange', remember);
    return () => window.removeEventListener('hashchange', remember);
  }, []);
  return (
    <main className="wrap network">
      <Link className="brand" href="/network/">
        <BrandLogo />
      </Link>
      <section className="panel mt-8">
        <p className="eyebrow">A PLACE FOR YOU</p>
        <h1>Join a conservation co-op</h1>
        <p>
          This single-use invitation lets you request membership in a private or
          public group. A steward reviews your request before you can see
          private records.
        </p>
        {!signedIn || needsSignIn ? (
          <>
            <Link
              className="button primary"
              target="_top"
              href={invitationSignInPath}
            >
              Sign in
            </Link>
            <p>
              {!invite
                ? 'Open the complete invitation link shared by your steward to continue.'
                : remembered
                  ? 'Sign in or create an account in this tab. Your invitation will be waiting when you return. Save your recovery code if you create or recover an account.'
                  : 'Your browser could not keep the invitation in this tab. After signing in, reopen the original invitation link to continue.'}
            </p>
          </>
        ) : done ? (
          <>
            <output>
              Your request is saved. A steward can now approve it.
            </output>
            <Link className="button primary" href="/workspace/">
              My co-ops
            </Link>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !invite) return;
              if (requestId.current.invitation !== invite) {
                requestId.current = {
                  invitation: invite,
                  value: crypto.randomUUID(),
                };
              }
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
                    requestId: requestId.current.value,
                  }),
                });
                const v: { error?: string } = await r.json();
                if (r.status === 401) {
                  setRemembered(
                    rememberInvitation(invitationStorage(), invite),
                  );
                  setNeedsSignIn(true);
                  throw new Error(
                    'Your session ended. Sign in to continue with this invitation.',
                  );
                }
                if (!r.ok)
                  throw new Error(
                    v.error ?? 'The invitation could not be accepted.',
                  );
                clearInvitation(invitationStorage());
                history.replaceState(null, '', '/join/');
                window.dispatchEvent(new Event(invitationChanged));
                setDone(true);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ControlLabel>
              Your member name
              <Input
                value={name}
                maxLength={80}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </ControlLabel>
            <Button type="submit" className="mt-4" disabled={busy || !invite}>
              {busy ? 'Saving…' : 'Request to join'}
            </Button>
            {!invite && (
              <p>Open the complete invitation link shared by your steward.</p>
            )}
          </form>
        )}
        <p role="alert">{message}</p>
        {message && !needsSignIn && (
          <p>
            If this invitation has expired, was revoked, or has already been
            used, ask your steward for a new link.
          </p>
        )}
      </section>
    </main>
  );
}
