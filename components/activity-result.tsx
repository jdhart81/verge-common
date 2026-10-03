'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ControlLabel } from '@/components/ui/label';
import { ShareActivity } from '@/components/share-activity';
import { activityPath } from '@/lib/activity-path.mjs';
export type ActivityResult = {
  summary: string;
  attendeeIds: string[];
  status: string;
  published: boolean;
  canReview?: boolean;
};
export function ActivityResultForm({
  event,
  members,
  steward,
  disabled,
  mutate,
  now,
}: {
  now: number;
  event: {
    id: string;
    status: string;
    endsAt: number;
    visibility?: string;
    isOrganizer?: boolean;
    hidden?: boolean;
    result?: ActivityResult;
  };
  members: { id: string; name?: string; status: string }[];
  steward: boolean;
  disabled: boolean;
  mutate: (op: string, p: Record<string, unknown>) => Promise<boolean>;
}) {
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  async function save(
    e: { preventDefault(): void; currentTarget: HTMLFormElement },
    op: string,
  ) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setError('');
    try {
      await mutate(op, {
        id: event.id,
        summary: data.get('summary'),
        attendeeIds: data.getAll('attendeeId'),
        decision: data.get('decision'),
        note: data.get('note'),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (event.hidden) return null;
  return (
    <div className="mt-4">
      {event.result && (
        <div className="notice">
          <h3>Completed work · {event.result.status}</h3>
          <p>{event.result.summary}</p>
          <p className="small">
            Attendance is an organizer’s confirmation, separate from RSVPs.
            Review checks the community record; it does not certify ecological
            outcomes.
          </p>
        </div>
      )}
      {(steward || event.isOrganizer) &&
        event.status === 'scheduled' &&
        event.endsAt <= now && (
          <details>
            <summary>Record completed activity and actual attendance</summary>
            <form onSubmit={(e) => save(e, 'complete_event')}>
              <ControlLabel>
                Work actually completed
                <Textarea name="summary" required maxLength={2000} />
              </ControlLabel>
              <fieldset disabled={disabled || saving}>
                <legend>
                  Who actually attended? Do not infer attendance from RSVPs.
                </legend>
                {members
                  .filter((m) => m.status === 'active')
                  .map((m) => (
                    <ControlLabel key={m.id}>
                      <Input type="checkbox" name="attendeeId" value={m.id} />
                      {m.name || 'Member'}
                    </ControlLabel>
                  ))}
                <Button type="submit">Save completed work for review</Button>
              </fieldset>
            </form>
          </details>
        )}
      {event.result?.canReview && (
        <form onSubmit={(e) => save(e, 'review_event_result')}>
          <ControlLabel>
            Independent review note
            <Textarea name="note" required maxLength={1000} />
          </ControlLabel>
          <select name="decision">
            <option value="approve">Approve the record</option>
            <option value="reject">Reject the record</option>
          </select>
          <Button type="submit" disabled={disabled || saving}>
            Record review
          </Button>
        </form>
      )}
      {steward &&
        event.result?.status === 'reviewed' &&
        event.visibility === 'public' && (
          <details>
            <summary>Preview public completed-work card</summary>
            <div className="notice">
              <p>{event.result.summary}</p>
              <p>
                {event.result.attendeeIds.length} confirmed participants ·
                Independently reviewed community record
              </p>
              <p>
                No names, meeting instructions or evidence files will be
                published.
              </p>
            </div>
            <Button
              disabled={disabled || saving || event.result.published}
              onClick={() =>
                mutate('publish_event_result', { id: event.id, confirm: true })
              }
            >
              Publish this reviewed result
            </Button>
          </details>
        )}
      {steward && event.result?.published && (
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => mutate('revoke_event_result', { id: event.id })}
        >
          Withdraw public result
        </Button>
      )}
      <p role="alert">{error}</p>
    </div>
  );
}
export function PublicActivityLink({
  coopId,
  kind,
  id,
  title,
  referral,
}: {
  coopId: string;
  kind: string;
  id: string;
  title: string;
  referral?: string;
}) {
  const path = activityPath(coopId, kind, id);
  return (
    <div className="mt-3">
      <a className="text-link" href={path}>
        Open public activity →
      </a>
      <ShareActivity path={path} title={title} referral={referral} />
    </div>
  );
}
