'use client';
import { useState } from 'react';
import { BrowserReminders } from '@/components/browser-reminders';
import { Button } from '@/components/ui/button';
export type CareAction = {
  id: string;
  projectId: string;
  title: string;
  instructions: string;
  due: string;
  repeatDays: number;
  status: string;
  kind: string;
  memberId: string;
  canReview?: boolean;
  submission?: { summary: string };
  history: { due: string; decision: string; summary: string; note: string }[];
};
export type Participation = {
  requested: number;
  approved: number;
  contributed: number;
  returnedLaterWeek: number;
  confirmedAttendance: number;
  completedActivities: number;
  unclassified: number;
  referredContributors: number;
};
type State = {
  careActions?: CareAction[];
  participation?: Participation;
  notices?: { id: string; text: string; at: number }[];
  members: {
    id: string;
    name: string;
    status: string;
    isYou?: boolean;
    participationCohort?: string;
  }[];
  projects: { id: string; name: string; status: string }[];
  parcels: { id: string; projectId: string; status: string; name?: string }[];
  evidence: { id: string; projectId: string; title: string; status: string }[];
};
function Form({
  children,
  label,
  save,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  save: (v: FormData) => Promise<boolean>;
  disabled: boolean;
}) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        setBusy(true);
        setMessage('');
        try {
          if (await save(new FormData(form))) form.reset();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={disabled || busy}>
        {children}
        <Button type="submit">{busy ? 'Saving…' : label}</Button>
      </fieldset>
      <p role="alert">{message}</p>
    </form>
  );
}
export function MissionTools({
  state,
  steward,
  disabled,
  mutate,
}: {
  state: State;
  steward: boolean;
  disabled: boolean;
  mutate: (op: string, p: Record<string, unknown>) => Promise<boolean>;
}) {
  const report = state.participation;
  return (
    <section className="mt-6">
      <h2>Participation and continuing care</h2>
      <BrowserReminders />
      {!!state.notices?.length && (
        <section className="notice mt-5">
          <h3>Your recent updates</h3>
          <ul>
            {state.notices.map((n) => (
              <li key={n.id}>
                {n.text} <time>{new Date(n.at).toLocaleDateString()}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
      {steward && report && (
        <details className="panel mt-5">
          <summary>Participant adoption report</summary>
          <p>
            Counts use members explicitly marked as participants. Founder
            activity and unclassified or test accounts are excluded.
          </p>
          <dl>
            {[
              ['Membership requests', report.requested],
              ['Currently approved', report.approved],
              ['First recorded contribution', report.contributed],
              [
                'Contributed again at least a week later',
                report.returnedLaterWeek,
              ],
              ['Confirmed attendees', report.confirmedAttendance],
              [
                'Completed shared activities with participants',
                report.completedActivities,
              ],
              [
                'Shared-link participants who contributed',
                report.referredContributors,
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            Website visitors and off-platform sharing: unavailable. Shared-link
            source codes are attribution records, not proof of causation.{' '}
            {report.unclassified} non-founder memberships are unclassified.
          </p>
          <p className="small">
            Participation is not land protected or certified impact. A returning
            member needs a later recorded contribution.
          </p>
          {state.members
            .filter((m) => !m.isYou)
            .map((m) => (
              <label className="block mt-3" key={m.id}>
                {m.name}
                <select
                  aria-label={`Participation classification for ${m.name}`}
                  value={m.participationCohort || 'unclassified'}
                  disabled={disabled}
                  onChange={(e) =>
                    mutate('classify_participant', {
                      id: m.id,
                      cohort: e.target.value,
                    })
                  }
                >
                  <option value="unclassified">Unclassified</option>
                  <option value="participant">Real participant</option>
                  <option value="test">Owner or test account</option>
                </select>
              </label>
            ))}
        </details>
      )}
      <h3 className="mt-5">Care commitments and disturbances</h3>
      <p>
        Assign a member and due date, record evidence, and have another steward
        review completion. Approved recurring care creates its next due date.
      </p>
      {(state.careActions ?? []).map((a) => (
        <article className="network-card" key={a.id}>
          <p className="eyebrow">
            {a.kind} · {a.status}
          </p>
          <h4>{a.title}</h4>
          <p>{a.instructions}</p>
          <p>
            Due {a.due}
            {a.repeatDays ? ` · Repeat every ${a.repeatDays} days` : ''} ·
            Responsible:{' '}
            {state.members.find((m) => m.id === a.memberId)?.name ||
              'Former member'}
          </p>
          {a.status === 'open' && (
            <Form
              disabled={disabled}
              label="Submit completed care"
              save={(v) =>
                mutate('submit_care_action', {
                  id: a.id,
                  summary: v.get('summary'),
                  evidenceId: v.get('evidenceId'),
                })
              }
            >
              <label>
                Work completed
                <textarea name="summary" maxLength={2000} required />
              </label>
              <label>
                Supporting evidence
                <select name="evidenceId" required>
                  <option value="">Choose evidence</option>
                  {state.evidence
                    .filter(
                      (e) =>
                        e.projectId === a.projectId && e.status !== 'rejected',
                    )
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.status}
                      </option>
                    ))}
                </select>
              </label>
            </Form>
          )}
          {a.submission && <p>Awaiting review: {a.submission.summary}</p>}
          {a.canReview && (
            <Form
              disabled={disabled}
              label="Record independent care review"
              save={(v) =>
                mutate('review_care_action', {
                  id: a.id,
                  decision: v.get('decision'),
                  note: v.get('note'),
                })
              }
            >
              <label>
                Decision
                <select name="decision">
                  <option value="approve">
                    Approve (requires reviewed evidence)
                  </option>
                  <option value="reject">Return for correction</option>
                </select>
              </label>
              <label>
                Review note
                <textarea name="note" required maxLength={1000} />
              </label>
            </Form>
          )}
          {!!a.history.length && (
            <details>
              <summary>Care and disturbance history</summary>
              {a.history.map((h, i) => (
                <p key={i}>
                  {h.due} · {h.decision} · {h.summary} · {h.note}
                </p>
              ))}
            </details>
          )}
          {steward && !['closed', 'withdrawn'].includes(a.status) && (
            <details>
              <summary>Withdraw this commitment</summary>
              <Form
                disabled={false}
                label="Withdraw care action"
                save={(v) =>
                  mutate('withdraw_care_action', {
                    id: a.id,
                    reason: v.get('reason'),
                  })
                }
              >
                <label>
                  Reason
                  <textarea name="reason" required maxLength={500} />
                </label>
              </Form>
            </details>
          )}
        </article>
      ))}
      {steward && (
        <details className="panel">
          <summary>Add a care commitment or disturbance response</summary>
          <Form
            disabled={disabled}
            label="Save care action"
            save={(v) =>
              mutate('create_care_action', {
                ...Object.fromEntries(v),
                repeatDays: Number(v.get('repeatDays')),
              })
            }
          >
            <label>
              Project
              <select name="projectId" required>
                <option value="">Choose project</option>
                {state.projects
                  .filter((p) => p.status !== 'cancelled')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Optional parcel
              <select name="parcelId">
                <option value="">Project-wide care</option>
                {state.parcels
                  .filter((p) => p.status !== 'withdrawn')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Kind
              <select name="kind">
                <option value="care">Continuing care</option>
                <option value="disturbance">Disturbance response</option>
              </select>
            </label>
            <label>
              Title
              <input name="title" required maxLength={200} />
            </label>
            <label>
              What must be done?
              <textarea name="instructions" required maxLength={2000} />
            </label>
            <label>
              Responsible member
              <select name="memberId" required>
                <option value="">Choose member</option>
                {state.members
                  .filter((m) => m.status === 'active')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Due date
              <input name="due" type="date" required />
            </label>
            <label>
              Repeat every days (0 = one time)
              <input
                name="repeatDays"
                type="number"
                min="0"
                max="366"
                defaultValue="0"
                required
              />
            </label>
          </Form>
        </details>
      )}
    </section>
  );
}
