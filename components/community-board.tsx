'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { eventCalendar } from '@/lib/calendar.mjs';
type RecordItem = { id: string; [key: string]: any };
type Save = (op: string, payload: any) => Promise<boolean>;
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
function ProjectSelect({ projects }: { projects: RecordItem[] }) {
  return (
    <label>
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
    </label>
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
        <label>
          What should a steward review?
          <Textarea name="reason" required maxLength={2000} />
        </label>
        <p className="small">
          Your report is visible to you and the co-op’s stewards.
        </p>
      </Form>
    </details>
  );
}
export function PublicEvents({ events }: { events: RecordItem[] }) {
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
                : e.endsAt < Date.now()
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
  mutate,
}: {
  state: any;
  steward: boolean;
  busy: boolean;
  mutate: Save;
}) {
  const [zone, setZone] = useState(''),
    [showPast, setShowPast] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(
    () => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );
  const disabled = busy || state.visibility === 'archived';
  const events: RecordItem[] = state.events ?? [],
    comments: RecordItem[] = state.comments ?? [],
    reports: RecordItem[] = state.reports ?? [];
  const visibleEvents = events
    .filter((e) => showPast || e.endsAt >= Date.now())
    .sort((a, b) => a.startsAt - b.startsAt);
  async function act(op: string, payload: any) {
    try {
      await mutate(op, payload);
      setNotice('Saved.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function calendar(event: RecordItem) {
    const url = URL.createObjectURL(
      new Blob([eventCalendar(event)], { type: 'text/calendar;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'conservation-event.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      'Calendar file downloaded. It includes private meeting instructions; keep it within your group. Re-download after a cancellation.',
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
          {
            state.members.filter((m: RecordItem) => m.status === 'active')
              .length
          }{' '}
          active memberships
        </span>
        <span>
          {
            events.filter(
              (e) =>
                e.status === 'scheduled' && !e.hidden && e.endsAt > Date.now(),
            ).length
          }{' '}
          upcoming events
        </span>
        <span>
          {
            state.tasks.filter((t: RecordItem) => t.status === 'completed')
              .length
          }{' '}
          actions marked complete
        </span>
      </div>
      {notice && (
        <p role="status" className="notice mt-4">
          {notice}
        </p>
      )}
      <Tabs defaultValue="events" className="mt-6">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
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
                  <p>
                    {e.goingCount} going
                    {e.capacity ? ` / ${e.capacity} places` : ''} · Your
                    response:{' '}
                    {e.yourResponse?.replace('_', ' ') || 'Not yet responded'}
                  </p>
                  {e.status === 'scheduled' &&
                    !e.hidden &&
                    e.endsAt > Date.now() && (
                      <div className="button-row">
                        {[
                          ['going', 'I’m going'],
                          ['interested', 'Interested'],
                          ['not_going', 'Can’t attend'],
                        ].map(([response, title]) => (
                          <Button
                            key={response}
                            disabled={disabled}
                            variant={
                              e.yourResponse === response
                                ? 'default'
                                : 'outline'
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
                      {e.attendees.map((a: any, i: number) => (
                        <p key={i}>
                          {a.name}: {a.response.replace('_', ' ')}
                        </p>
                      ))}
                    </details>
                  )}
                  {(steward || e.isOrganizer) && e.status === 'scheduled' && (
                    <details className="mt-4">
                      <summary>Cancel event</summary>
                      <Form
                        disabled={disabled}
                        submit="Cancel event"
                        save={(v) => mutate('cancel_event', { ...v, id: e.id })}
                      >
                        <label>
                          Reason for members
                          <Textarea name="reason" required maxLength={500} />
                        </label>
                      </Form>
                    </details>
                  )}
                  {!e.hidden && (
                    <Report
                      kind="event"
                      targetId={e.id}
                      save={mutate}
                      disabled={disabled}
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
                <label>
                  Event title
                  <Input name="title" maxLength={160} required />
                </label>
                <label>
                  Summary
                  <Textarea name="summary" maxLength={2000} required />
                </label>
                <label>
                  Start · {zone || 'your local time'}
                  <Input name="start" type="datetime-local" required />
                </label>
                <label>
                  End · {zone || 'your local time'}
                  <Input name="end" type="datetime-local" required />
                </label>
                <label>
                  Private meeting instructions
                  <Textarea name="meetingDetails" required maxLength={2000} />
                </label>
                <label>
                  Available places (0 = no cap)
                  <Input
                    name="capacity"
                    type="number"
                    min="0"
                    max="500"
                    defaultValue="0"
                    required
                  />
                </label>
                <label>
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
                </label>
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
          <div className="network-columns">
            <section>
              {![...state.updates].length && (
                <p className="empty">
                  Share the first project update or question.
                </p>
              )}
              {[...state.updates].reverse().map((u: RecordItem) => (
                <article className="network-card" key={u.id}>
                  <p className="eyebrow">
                    {
                      state.projects.find(
                        (p: RecordItem) => p.id === u.projectId,
                      )?.name
                    }{' '}
                    · {u.hidden ? 'Hidden' : u.visibility}
                  </p>
                  <h3>{u.author}</h3>
                  <p className="small">
                    {new Date(u.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap">{u.text}</p>
                  {comments
                    .filter((c) => c.updateId === u.id)
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
                                disabled={disabled}
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
                              disabled={disabled}
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
                        <label>
                          Member-only reply
                          <Textarea name="text" maxLength={2000} required />
                        </label>
                      </Form>
                      <Report
                        kind="update"
                        targetId={u.id}
                        save={mutate}
                        disabled={disabled}
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
                <label>
                  What is happening?
                  <Textarea name="text" required maxLength={2000} />
                </label>
                <label>
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
                </label>
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
            const target = source.find((x: RecordItem) => x.id === r.targetId);
            return (
              <article className="network-card" key={r.id}>
                <p className="eyebrow">
                  {r.kind} · {r.status}
                </p>
                <p>{r.reason}</p>
                {steward && target && (
                  <blockquote className="notice">
                    {target.text ?? target.title}
                  </blockquote>
                )}
                {r.note && <p>Review note: {r.note}</p>}
                {steward && r.status === 'open' && (
                  <Form
                    disabled={disabled}
                    submit="Save review decision"
                    save={(v) => mutate('resolve_report', { ...v, id: r.id })}
                  >
                    <label>
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
                    </label>
                    <label>
                      Review note
                      <Textarea name="note" required maxLength={1000} />
                    </label>
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
