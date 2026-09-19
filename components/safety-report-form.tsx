'use client';
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ControlLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type Receipt = {
  id: string;
  receipt: string;
  status: string;
  updatedAt?: number;
};
const subscribe = () => () => {};
const querySnapshot = () => window.location.search;
const serverSnapshot = () => '';
const makeReceipt = (): Receipt => ({
  id: crypto.randomUUID(),
  receipt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join(''),
  status: 'not_sent',
});
const labels: Record<string, string> = {
  received: 'Received — awaiting operator review',
  reviewing: 'An operator is reviewing your report',
  closed: 'Review completed',
  action_taken: 'Review completed — action taken',
  not_sent: 'Not yet confirmed',
};

export function SafetyReportForm() {
  const query = new URLSearchParams(
    useSyncExternalStore(subscribe, querySnapshot, serverSnapshot),
  );
  const kind = query.get('kind') ?? 'general';
  const coopId = query.get('coop') ?? '';
  const targetId = query.get('target') ?? '';
  const [category, setCategory] = useState('abuse');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [earlierReceipt, setEarlierReceipt] = useState<Receipt | null>(null);
  const [lookup, setLookup] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [frozen, setFrozen] = useState(false);
  async function send(mode: 'submit' | 'current-status' | 'lookup') {
    setBusy(true);
    setMessage('');
    const statusOnly = mode !== 'submit';
    let active = receipt;
    try {
      if (mode === 'lookup') {
        setEarlierReceipt(null);
        const value = lookup.trim();
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{64}$/.test(
            value,
          )
        )
          throw new Error(
            'Paste the complete private receipt, including the dot between its two parts.',
          );
        const [id, token] = value.split('.');
        active = { id, receipt: token, status: 'not_sent' };
      }
      if (mode === 'submit') {
        active ??= makeReceipt();
        setReceipt(active);
        setFrozen(true);
      }
      if (!active)
        throw new Error('There is no current report receipt to check.');
      const response = await fetch(
        statusOnly ? '/api/safety-reports/status' : '/api/safety-reports',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            statusOnly
              ? { id: active.id, receipt: active.receipt }
              : {
                  requestId: active.id,
                  receipt: active.receipt,
                  kind,
                  coopId,
                  targetId,
                  category,
                  reason,
                },
          ),
        },
      );
      const value: {
        id: string;
        status: string;
        updatedAt?: number;
        error?: string;
      } = await response.json();
      if (!response.ok) {
        if (
          !statusOnly &&
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 409
        )
          setFrozen(false);
        throw new Error(
          value.error ??
            'The report could not be confirmed. Keep your receipt and try again.',
        );
      }
      if (
        value.id !== active.id ||
        !['received', 'reviewing', 'closed', 'action_taken'].includes(
          value.status,
        )
      )
        throw new Error(
          'The report status could not be confirmed. Keep your receipt and try again.',
        );
      const confirmed = {
        ...active,
        status: value.status,
        updatedAt: value.updatedAt,
      };
      if (mode === 'lookup') setEarlierReceipt(confirmed);
      else {
        setReceipt(confirmed);
        setSent(true);
      }
      setMessage(
        statusOnly
          ? 'Status checked.'
          : 'Your report was received by the private operator queue.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to confirm the report. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        This goes to the VergeCommon operator, including concerns about a
        co-op’s stewards. Reports are private. No email account is required.
        Keep the receipt to check progress; it does not reveal your report text.
      </p>
      <p className="notice">
        Include only what is needed to explain the concern. Leave out passwords,
        invitation links, precise habitat locations and private evidence files.
        This is not an emergency response service.
      </p>
      {!sent && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send('submit');
          }}
          className="grid gap-4"
        >
          {kind !== 'general' && (
            <p>
              Reporting a {kind} in co-op {coopId}.{' '}
              <Link href="/report/">Send a general concern instead</Link>.
            </p>
          )}
          <ControlLabel>
            Type of concern
            <select
              value={category}
              disabled={busy || frozen}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="abuse">Harmful content or conduct</option>
              <option value="privacy">Privacy</option>
              <option value="access">Access or unfair moderation</option>
              <option value="other">Other concern</option>
            </select>
          </ControlLabel>
          <ControlLabel>
            What happened?
            <Textarea
              required
              minLength={20}
              maxLength={4000}
              rows={6}
              value={reason}
              disabled={busy || frozen}
              onChange={(event) => setReason(event.target.value)}
            />
          </ControlLabel>
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Sending…'
              : frozen
                ? 'Retry this report'
                : 'Send private report'}
          </Button>
        </form>
      )}
      {receipt && (
        <section className="mt-6">
          <h2>Your private receipt</h2>
          <p>{labels[receipt.status] ?? receipt.status}</p>
          <ControlLabel>
            Copy and keep this receipt
            <Input
              readOnly
              value={`${receipt.id}.${receipt.receipt}`}
              onFocus={(event) => event.target.select()}
            />
          </ControlLabel>
          <p>
            The receipt is held in this page while it is open. Save it before
            leaving. It cannot retrieve the report’s contents.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void send('current-status');
            }}
          >
            Check this report
          </Button>
        </section>
      )}
      <section className="mt-6">
        <h2>Check an earlier report</h2>
        <p>
          Checking an earlier report keeps any new report you are writing above
          intact.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send('lookup');
          }}
        >
          <ControlLabel>
            Private receipt
            <Input
              required
              value={lookup}
              onChange={(event) => {
                setLookup(event.target.value);
                setEarlierReceipt(null);
              }}
              autoComplete="off"
            />
          </ControlLabel>
          <Button
            type="submit"
            className="mt-3"
            variant="outline"
            disabled={busy || !lookup.trim()}
          >
            Check status
          </Button>
        </form>
        {earlierReceipt && (
          <output>
            Earlier report {earlierReceipt.id.slice(0, 8)}:{' '}
            {labels[earlierReceipt.status] ?? earlierReceipt.status}
          </output>
        )}
      </section>
      <output aria-live="polite">{message}</output>
      <p>
        For follow-up or a missing receipt, contact{' '}
        <a href="mailto:justin@viridisconservation.com">
          justin@viridisconservation.com
        </a>
        . An operator must review reports; receipt confirmation is not a promise
        that action has already been taken.
      </p>
    </>
  );
}
