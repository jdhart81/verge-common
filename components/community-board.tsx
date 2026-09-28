'use client';
import { ControlLabel } from '@/components/ui/label';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { eventCalendar } from '@/lib/calendar.mjs';
type CommunityProject = { id: string; name: string; status: string };
export type CommunityEvent = {
  id: string;
  title: string;
  summary: string;
  startsAt: number;
  endsAt: number;
  timeZone: string;
  status: string;
  projectId?: string;
  createdAt?: number;
  updatedAt?: number;
  cancelledAt?: number;
  calendarSequence?: number;
  hidden?: boolean;
  blocked?: boolean;
  visibility?: string;
  meetingDetails?: string;
  cancelReason?: string;
  capacity?: number;
  goingCount?: number;
  yourResponse?: string;
  isOrganizer?: boolean;
  attendees?: { name: string; response: string }[];
};
type CommunityUpdate = {
  id: string;
  projectId: string;
  hidden: boolean;
  visibility: string;
  author: string;
  createdAt: number;
  text: string;
  blocked?: boolean;
};
type CommunityComment = {
  id: string;
  updateId: string;
  author: string;
  text: string;
  hidden: boolean;
  isYou: boolean;
  blocked?: boolean;
};
type CommunityReport = {
  id: string;
  targetId: string;
  kind: string;
  status: string;
  reason: string;
  note?: string;
};
export type CommunityState = {
  visibility: string;
  members: { status: string }[];
  tasks: { status: string }[];
  projects: CommunityProject[];
  updates: CommunityUpdate[];
  events?: CommunityEvent[];
  comments?: CommunityComment[];
  reports?: CommunityReport[];
};
type Save = (op: string, payload: Record<string, unknown>) => Promise<boolean>;
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 1000);
  return () => window.clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverClock = () => 0;
function subscribeTimeZone(onChange: () => void) {
  window.addEventListener('focus', onChange);
  return () => window.removeEventListener('focus', onChange);
}
const timeZoneSnapshot = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => '';
function localDateTime(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function eventInstant(value: string, original: number) {
  // Preserve the original instant when an unchanged local time falls in a DST fold.
  return value === localDateTime(original)
    ? original
    : new Date(value).getTime();
}
function Form({
  children,
  submit,
  save,
  disabled,
}: {
  children: React.ReactNode;
  submit: string;
  save: (data: Record<string, string>) => Promise<boolean>;
  disabled: boolean;
}) {
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form)) as Record<
          string,
          string
        >;
        setSaving(true);
        setError('');
        try {
          if (await save(data)) form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={disabled || saving}>
        {children}
        <Button type="submit" className="mt-4">
          {saving ? 'Saving…' : submit}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
function ProjectSelect({ projects }: { projects: CommunityProject[] }) {
  return (
    <ControlLabel>
      Project
      <NativeSelect name="projectId" required>
        <NativeSelectOption value="">Choose a project</NativeSelectOption>
        {projects
          .filter((p) => p.status !== 'cancelled')
          .map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
      </NativeSelect>
    </ControlLabel>
  );
}
function Report({
  kind,
  targetId,
  save,
  disabled,
}: {
  kind: string;
  targetId: string;
  save: Save;
  disabled: boolean;
}) {
  return (
    <details className="mt-4">
      <summary>Report a concern</summary>
      <Form
        disabled={disabled}
        submit="Send to co-op stewards"
        save={(v) => save('report_content', { ...v, kind, targetId })}
      >
        <ControlLabel>
          What should a steward review?
          <Textarea name="reason" required maxLength={2000} />
        </ControlLabel>
        <p className="small">
          Your report is visible to you and the co-op’s stewards.
        </p>
      </Form>
    </details>
  );
}
export function PublicEvents({ events }: { events: CommunityEvent[] }) {
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  if (!events?.length) return null;
  return (
    <section className="mt-6">
      <h2>Community events</h2>
      {[...events]
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((e) => (
          <article className="network-card" key={e.id}>
            <p className="eyebrow">
              {e.status === 'cancelled'
                ? 'Cancelled'
                : e.endsAt < now
                  ? 'Past event'
                  : 'Coming up'}
            </p>
            <h3>{e.title}</h3>
            <p>
              {new Date(e.startsAt).toLocaleString(undefined, {
                timeZone: e.timeZone,
              })}{' '}
              ({e.timeZone})
            </p>
            <p>{e.summary}</p>
            <p className="small">
              Members can see meeting instructions and respond inside the co-op.
            </p>
          </article>
        ))}
    </section>
  );
}
export function CommunityBoard({
  state,
  steward,
  busy,
  growthPaused = false,
  conversationActions,
  mutate,
}: {
  state: CommunityState;
  steward: boolean;
  busy: boolean;
  growthPaused?: boolean;
  conversationActions?: React.ReactNode;
  mutate: Save;
}) {
  const zone = useSyncExternalStore(
    subscribeTimeZone,
    timeZoneSnapshot,
    serverTimeZone,
  );
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  const [showPast, setShowPast] = useState(false),
    [notice, setNotice] = useState('');
  const disabled = busy || state.visibility === 'archived' || growthPaused;
  const events: CommunityEvent[] = state.events ?? [],
    comments: CommunityComment[] = state.comments ?? [],
    reports: CommunityReport[] = state.reports ?? [];
  const visibleEvents = events
    .filter((e) => !e.blocked && (showPast || e.endsAt >= now))
    .sort((a, b) => a.startsAt - b.startsAt);
  async function act(op: string, payload: Record<string, unknown>) {
    try {
      await mutate(op, payload);
      setNotice('Saved.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function calendar(event: CommunityEvent) {
    const url = URL.createObjectURL(
      new Blob([eventCalendar(event)], { type: 'text/calendar;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'conservation-event.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      'Calendar file downloaded. It includes private meeting instructions; keep it within your group. Re-download and import after an edit or cancellation. Your calendar may ask whether to update its existing entry.',
    );
  }
  return (
    <section>
      <h2>Your local circle</h2>
      <p>
        Plan the next workday, ask a question, and keep each other up to date.
      </p>
      <div className="network-meta">
        <span>
          {state.members.filter((m) => m.status === 'active').length} active
          memberships
        </span>
        <span>
          {
            events.filter(
              (e) =>
                e.status === 'scheduled' &&
                !e.hidden &&
                !e.blocked &&
                e.endsAt > now,
            ).length
          }{' '}
          upcoming events
        </span>
        <span>
          {state.tasks.filter((t) => t.status === 'completed').length} actions
          marked complete
        </span>
      </div>
      {notice && <output className="notice mt-4">{notice}</output>}
      <Tabs defaultValue="discussion" className="mt-6">
        <TabsList>
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="reports">
            {steward ? 'Moderation' : 'My reports'}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <div className="network-columns">
            <section>
              <div className="network-meta">
                <h3>{showPast ? 'All events' : 'Coming up'}</h3>
                <Button
                  variant="outline"
                  onClick={() => setShowPast(!showPast)}
                >
                  {showPast ? 'Upcoming only' : 'Include past events'}
                </Button>
              </div>
              {!visibleEvents.length && (
                <p className="empty">
                  Plan your first shared activity: a planting day, monitoring
                  walk, or co-op meeting.
                </p>
              )}
              {visibleEvents.map((e) => (
                <article className="network-card" key={e.id}>
                  <p className="eyebrow">
                    {e.hidden ? 'Hidden by moderation' : e.status} ·{' '}
                    {e.visibility === 'public'
                      ? 'Public summary'
                      : 'Members only'}
                  </p>
                  <h3>{e.title}</h3>
                  <p>
                    {new Date(e.startsAt).toLocaleString(undefined, {
                      timeZone: e.timeZone,
                    })}{' '}
                    –{' '}
                    {new Date(e.endsAt).toLocaleString(undefined, {
                      timeZone: e.timeZone,
                    })}{' '}
                    ({e.timeZone})
                  </p>
                  <p>{e.summary}</p>
                  <div className="notice">
                    <strong>Member meeting instructions</strong>
                    <p className="whitespace-pre-wrap">{e.meetingDetails}</p>
                  </div>
                  {e.cancelReason && <p>Cancellation: {e.cancelReason}</p>}
                  {!!e.updatedAt && (
                    <p className="notice">
                      Event details changed on{' '}
                      {new Date(e.updatedAt).toLocaleString()}. Please check the
                      time and meeting instructions, update your response if
                      needed, and download the latest calendar entry.
                    </p>
                  )}
                  <p>
                    {e.goingCount} going
                    {e.capacity ? ` / ${e.capacity} places` : ''} · Your
                    response:{' '}
                    {e.yourResponse?.replace('_', ' ') || 'Not yet responded'}
                  </p>
                  {e.status === 'scheduled' && !e.hidden && e.endsAt > now && (
                    <div className="button-row">
                      {[
                        ['going', 'I’m going'],
                        ['interested', 'Interested'],
                        ['not_going', 'Can’t attend'],
                      ].map(([response, title]) => (
                        <Button
                          key={response}
                          disabled={
                            response === 'not_going' && !!e.yourResponse
                              ? busy
                              : disabled
                          }
                          variant={
                            e.yourResponse === response ? 'default' : 'outline'
                          }
                          onClick={() =>
                            act('event_rsvp', { id: e.id, response })
                          }
                        >
                          {title}
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => calendar(e)}
                  >
                    Download calendar entry
                  </Button>
                  {!!e.attendees?.length && (
                    <details className="mt-4">
                      <summary>Responses · organizer and stewards only</summary>
                      {e.attendees.map((a, i) => (
                        <p key={i}>
                          {a.name}: {a.response.replace('_', ' ')}
                        </p>
                      ))}
                    </details>
                  )}
                  {(steward || e.isOrganizer) &&
                    e.status === 'scheduled' &&
                    !e.hidden &&
                    e.startsAt > now && (
                      <details className="mt-4">
                        <summary>Edit or reschedule event</summary>
                        <Form
                          key={e.updatedAt ?? e.createdAt ?? e.id}
                          disabled={disabled || !zone}
                          submit="Save event changes"
                          save={async (v) => {
                            const startsAt = eventInstant(v.start, e.startsAt);
                            const endsAt = eventInstant(v.end, e.endsAt);
                            const saved = await mutate('update_event', {
                              ...v,
                              id: e.id,
                              startsAt,
                              endsAt,
                              timeZone:
                                startsAt === e.startsAt && endsAt === e.endsAt
                                  ? e.timeZone
                                  : zone,
                              capacity: Number(v.capacity),
                            });
                            if (saved)
                              setNotice(
                                'Event updated. Existing responses are kept. Tell participants about the change and ask them to check their response and calendar.',
                              );
                            return saved;
                          }}
                        >
                          <ControlLabel>
                            Event title
                            <Input
                              name="title"
                              maxLength={160}
                              required
                              defaultValue={e.title}
                            />
                          </ControlLabel>
                          <ControlLabel>
                            Summary
                            <Textarea
                              name="summary"
                              maxLength={2000}
                              required
                              defaultValue={e.summary}
                            />
                          </ControlLabel>
                          <ControlLabel>
                            Start · {zone || 'your local time'}
                            <Input
                              name="start"
                              type="datetime-local"
                              required
                              defaultValue={
                                zone ? localDateTime(e.startsAt) : ''
                              }
                            />
                          </ControlLabel>
                          <ControlLabel>
                            End · {zone || 'your local time'}
                            <Input
                              name="end"
                              type="datetime-local"
                              required
                              defaultValue={zone ? localDateTime(e.endsAt) : ''}
                            />
                          </ControlLabel>
                          <ControlLabel>
                            Private meeting instructions
                            <Textarea
                              name="meetingDetails"
                              maxLength={2000}
                              required
                              defaultValue={e.meetingDetails}
                            />
                          </ControlLabel>
                          <ControlLabel>
                            Available places (0 = no cap)
                            <Input
                              name="capacity"
                              type="number"
                              min="0"
                              max="500"
                              required
                              defaultValue={e.capacity ?? 0}
                            />
                          </ControlLabel>
                          <ControlLabel>
                            Who can discover this event?
                            <NativeSelect
                              name="visibility"
                              defaultValue={steward ? e.visibility : 'members'}
                            >
                              <NativeSelectOption value="members">
                                Members only
                              </NativeSelectOption>
                              {steward && (
                                <NativeSelectOption value="public">
                                  Public summary
                                </NativeSelectOption>
                              )}
                            </NativeSelect>
                          </ControlLabel>
                          {!steward && e.visibility === 'public' && (
                            <p>
                              These changes make the event members-only. Ask a
                              steward to update its public summary.
                            </p>
                          )}
                          <p className="small">
                            Existing responses stay recorded. This does not send
                            notifications: tell participants about time or
                            location changes and ask them to check their plans.
                            Re-download the calendar entry after saving.
                          </p>
                        </Form>
                      </details>
                    )}
                  {(steward || e.isOrganizer) && e.status === 'scheduled' && (
                    <details className="mt-4">
                      <summary>Cancel event</summary>
                      <Form
                        disabled={busy}
                        submit="Cancel event"
                        save={(v) => mutate('cancel_event', { ...v, id: e.id })}
                      >
                        <ControlLabel>
                          Reason for members
                          <Textarea name="reason" required maxLength={500} />
                        </ControlLabel>
                      </Form>
                    </details>
                  )}
                  {!e.hidden && (
                    <Report
                      kind="event"
                      targetId={e.id}
                      save={mutate}
                      disabled={busy}
                    />
                  )}
                </article>
              ))}
            </section>
            <aside className="panel">
              <h3>Plan a shared activity</h3>
              <Form
                disabled={disabled || !zone || !state.projects.length}
                submit="Create event"
                save={(v) =>
                  mutate('create_event', {
                    ...v,
                    startsAt: new Date(v.start).getTime(),
                    endsAt: new Date(v.end).getTime(),
                    timeZone: zone,
                    capacity: Number(v.capacity),
                  })
                }
              >
                <ProjectSelect projects={state.projects} />
                <ControlLabel>
                  Event title
                  <Input name="title" maxLength={160} required />
                </ControlLabel>
                <ControlLabel>
                  Summary
                  <Textarea name="summary" maxLength={2000} required />
                </ControlLabel>
                <ControlLabel>
                  Start · {zone || 'your local time'}
                  <Input name="start" type="datetime-local" required />
                </ControlLabel>
                <ControlLabel>
                  End · {zone || 'your local time'}
                  <Input name="end" type="datetime-local" required />
                </ControlLabel>
                <ControlLabel>
                  Private meeting instructions
                  <Textarea name="meetingDetails" required maxLength={2000} />
                </ControlLabel>
                <ControlLabel>
                  Available places (0 = no cap)
                  <Input
                    name="capacity"
                    type="number"
                    min="0"
                    max="500"
                    defaultValue="0"
                    required
                  />
                </ControlLabel>
                <ControlLabel>
                  Who can discover this event?
                  <NativeSelect name="visibility" defaultValue="members">
                    <NativeSelectOption value="members">
                      Members only
                    </NativeSelectOption>
                    {steward && (
                      <NativeSelectOption value="public">
                        Public summary
                      </NativeSelectOption>
                    )}
                  </NativeSelect>
                </ControlLabel>
                <p className="small">
                  A public summary appears only when both the project and co-op
                  are public. Meeting instructions and responses stay within the
                  co-op. Times use the time zone shown above.
                </p>
              </Form>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="discussion">
          {conversationActions}
          <div className="network-columns">
            <section>
              {!state.updates.some((u) => !u.blocked) && (
                <p className="empty">
                  Share the first project update or question.
                </p>
              )}
              {state.updates
                .filter((u) => !u.blocked)
                .reverse()
                .map((u) => (
                  <article className="network-card" key={u.id}>
                    <p className="eyebrow">
                      {state.projects.find((p) => p.id === u.projectId)?.name} ·{' '}
                      {u.hidden ? 'Hidden' : u.visibility}
                    </p>
                    <h3>{u.author}</h3>
                    <p className="small">
                      {new Date(u.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap">{u.text}</p>
                    {comments
                      .filter((c) => c.updateId === u.id && !c.blocked)
                      .map((c) => (
                        <div className="panel mt-4" key={c.id}>
                          <strong>{c.author}</strong>
                          <p className="whitespace-pre-wrap">
                            {c.hidden ? '[Hidden comment]' : c.text}
                          </p>
                          {!c.hidden && (
                            <>
                              {(c.isYou || steward) && (
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    act('remove_comment', { id: c.id })
                                  }
                                >
                                  Hide comment
                                </Button>
                              )}
                              <Report
                                kind="comment"
                                targetId={c.id}
                                save={mutate}
                                disabled={busy}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    {!u.hidden && (
                      <>
                        <Form
                          disabled={disabled}
                          submit="Reply to group"
                          save={(v) =>
                            mutate('post_comment', { ...v, updateId: u.id })
                          }
                        >
                          <ControlLabel>
                            Member-only reply
                            <Textarea name="text" maxLength={2000} required />
                          </ControlLabel>
                        </Form>
                        <Report
                          kind="update"
                          targetId={u.id}
                          save={mutate}
                          disabled={busy}
                        />
                      </>
                    )}
                  </article>
                ))}
            </section>
            <aside className="panel">
              <h3>Share an update</h3>
              <Form
                disabled={disabled || !state.projects.length}
                submit="Post update"
                save={(v) => mutate('post_update', v)}
              >
                <ProjectSelect projects={state.projects} />
                <ControlLabel>
                  What is happening?
                  <Textarea name="text" required maxLength={2000} />
                </ControlLabel>
                <ControlLabel>
                  Visibility
                  <NativeSelect name="visibility" defaultValue="members">
                    <NativeSelectOption value="members">
                      Members only
                    </NativeSelectOption>
                    {steward && (
                      <NativeSelectOption value="public">
                        Public update
                      </NativeSelectOption>
                    )}
                  </NativeSelect>
                </ControlLabel>
                <p className="small">
                  Replies always stay inside the co-op, including replies to
                  public updates.
                </p>
              </Form>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="reports">
          <h3>
            {steward ? 'Review community concerns' : 'Your submitted concerns'}
          </h3>
          {!reports.length && <p className="empty">No reports to show.</p>}
          {[...reports].reverse().map((r) => {
            const source =
              r.kind === 'update'
                ? state.updates
                : r.kind === 'comment'
                  ? comments
                  : events;
            const target = source.find((x) => x.id === r.targetId);
            return (
              <article className="network-card" key={r.id}>
                <p className="eyebrow">
                  {r.kind} · {r.status}
                </p>
                <p>{r.reason}</p>
                {steward && target && (
                  <blockquote className="notice">
                    {'text' in target ? target.text : target.title}
                  </blockquote>
                )}
                {r.note && <p>Review note: {r.note}</p>}
                {steward && r.status === 'open' && (
                  <Form
                    disabled={busy}
                    submit="Save review decision"
                    save={(v) => mutate('resolve_report', { ...v, id: r.id })}
                  >
                    <ControlLabel>
                      Decision
                      <NativeSelect name="decision" required>
                        <NativeSelectOption value="">
                          Choose a decision
                        </NativeSelectOption>
                        <NativeSelectOption value="hide">
                          Hide content
                        </NativeSelectOption>
                        <NativeSelectOption value="dismiss">
                          Dismiss report
                        </NativeSelectOption>
                      </NativeSelect>
                    </ControlLabel>
                    <ControlLabel>
                      Review note
                      <Textarea name="note" required maxLength={1000} />
                    </ControlLabel>
                  </Form>
                )}
              </article>
            );
          })}
          <p className="small">
            Reports stay with this co-op. Another steward must resolve reports
            about their own content. Membership removal is available under
            Members.
          </p>
        </TabsContent>
      </Tabs>
    </section>
  );
}
