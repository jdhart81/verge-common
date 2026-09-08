'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sprout, Download, Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  STORAGE_KEY,
  emptyPlan,
  parsePlan,
  addTask,
  invitation,
} from '@/lib/planner.mjs';
type Plan = {
  version: number;
  name: string;
  area: string;
  purpose: string;
  notes: string;
  tasks: { id: string; title: string; done: boolean }[];
};
export default function Demo() {
  const [plan, setPlan] = useState<Plan>(emptyPlan());
  const [draft, setDraft] = useState({ name: '', area: '', purpose: '' });
  const [task, setTask] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const current = useRef(plan);
  current.current = plan;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = parsePlan(JSON.parse(raw));
        setPlan(saved);
        setDraft(saved);
      }
    } catch {
      setStatus(
        'The saved plan could not be loaded. You can start a new plan; download a backup before closing this page.',
      );
    }
    setReady(true);
  }, []);
  function commit(next: Plan, message: string) {
    setPlan(next);
    current.current = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStatus(message);
    } catch {
      setStatus(
        'Your changes are visible, but this browser could not save them. Download your plan before closing this page.',
      );
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'read_local_stewardship_plan',
            description:
              'Read the current device-local stewardship plan. This does not publish or share anything.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object.');
              return structuredClone(current.current);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, []);
  function savePlace(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    commit(
      {
        ...plan,
        name: draft.name.trim(),
        area: draft.area.trim(),
        purpose: draft.purpose.trim(),
      },
      'Place card saved on this device.',
    );
  }
  function newTask(e: React.FormEvent) {
    e.preventDefault();
    try {
      commit(
        addTask(plan, task, crypto.randomUUID()),
        'Action added on this device.',
      );
      setTask('');
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verge-common-plan.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Plan downloaded. Review its contents before sharing.');
  }
  async function copy() {
    const text = invitation(plan, window.location.origin);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback('');
      setStatus(
        'Invitation copied. It includes the place, general area, purpose, and unfinished actions. Review it before sharing.',
      );
    } catch {
      setCopyFallback(text);
      setStatus('Select and copy the invitation below.');
    }
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to planner
      </a>
      <header className="nav">
        <a className="brand" href="/">
          <Sprout />
          verge common
        </a>
        <a className="text-link" href="/">
          <ArrowLeft size={16} />
          About the project
        </a>
      </header>
      <main id="main" className="wrap planner">
        <p className="eyebrow">COMMUNITY EDITION / LOCAL PLANNER</p>
        <h1>A place to start.</h1>
        <p className="intro">
          Choose a place, plan one useful action, and keep a record of what you
          learn.
        </p>
        <div className="notice">
          Saved in this browser only. No account, shared workspace, or automatic
          publishing. Use a general area and leave out personal details and
          sensitive locations.
        </div>
        <div className="planner-grid">
          <section className="panel">
            <h2>Your place</h2>
            <form onSubmit={savePlace}>
              <label htmlFor="name">Place name</label>
              <Input
                id="name"
                required
                maxLength={100}
                placeholder="e.g. The neighborhood garden"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <label htmlFor="area">
                General area <span className="small">(optional)</span>
              </label>
              <Input
                id="area"
                maxLength={140}
                placeholder="Neighborhood or town"
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
              <label htmlFor="purpose">What do you want to care for?</label>
              <Textarea
                id="purpose"
                maxLength={600}
                placeholder="What could you improve together?"
                value={draft.purpose}
                onChange={(e) =>
                  setDraft({ ...draft, purpose: e.target.value })
                }
              />
              <Button
                type="submit"
                className="mt-5 h-11 px-4"
                disabled={!ready || !draft.name.trim()}
              >
                Save place card
              </Button>
            </form>
            <p className="small mt-6">
              One plan per browser. Download it as a backup. Clearing browser
              data removes the saved plan.
            </p>
          </section>
          <section aria-label="Your stewardship plan">
            {plan.name ? (
              <>
                <div className="place-card">
                  <p className="eyebrow">YOUR PLACE CARD</p>
                  <h2>{plan.name}</h2>
                  {plan.area && <p className="small">{plan.area}</p>}
                  <p>{plan.purpose || 'A place worth caring for.'}</p>
                  <span className="pill">
                    {plan.tasks.filter((t) => t.done).length} OF{' '}
                    {plan.tasks.length} ACTIONS COMPLETE
                  </span>
                </div>
                <div className="panel mt-5">
                  <h2>One action at a time</h2>
                  {!plan.tasks.length && (
                    <p className="small">
                      Try a short habitat survey, a cleanup, or a conversation
                      with neighbors.
                    </p>
                  )}
                  {plan.tasks.map((t) => (
                    <div
                      className={`task-row ${t.done ? 'done' : ''}`}
                      key={t.id}
                    >
                      <Checkbox
                        aria-label={`Mark ${t.title} ${t.done ? 'incomplete' : 'complete'}`}
                        checked={t.done}
                        onCheckedChange={(done) =>
                          commit(
                            {
                              ...plan,
                              tasks: plan.tasks.map((x) =>
                                x.id === t.id ? { ...x, done: !!done } : x,
                              ),
                            },
                            'Action updated on this device.',
                          )
                        }
                      />
                      <span>{t.title}</span>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Remove ${t.title}`}
                        onClick={() =>
                          commit(
                            {
                              ...plan,
                              tasks: plan.tasks.filter((x) => x.id !== t.id),
                            },
                            'Action removed.',
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                  ))}
                  <form className="task-form" onSubmit={newTask}>
                    <Input
                      aria-label="New action"
                      maxLength={180}
                      placeholder="A small, specific action…"
                      value={task}
                      onChange={(e) => setTask(e.target.value)}
                    />
                    <Button
                      type="submit"
                      disabled={!task.trim()}
                      className="h-10 px-4"
                    >
                      <Plus size={17} />
                      Add action
                    </Button>
                  </form>
                  <label htmlFor="notes">What did you learn?</label>
                  <Textarea
                    id="notes"
                    maxLength={2000}
                    placeholder="Record an observation or a next step. Notes stay out of copied invitations."
                    value={plan.notes}
                    onChange={(e) =>
                      commit(
                        { ...plan, notes: e.target.value },
                        'Notes saved on this device.',
                      )
                    }
                  />
                  <div className="planner-actions">
                    <Button
                      variant="outline"
                      className="h-11 px-4"
                      onClick={download}
                    >
                      <Download />
                      Download plan
                    </Button>
                    <Button className="h-11 px-4" onClick={copy}>
                      <Copy />
                      Copy invitation
                    </Button>
                  </div>
                  <p className="small mt-4">
                    The invitation includes your place, area, purpose, and
                    unfinished actions. You choose where to send it.
                  </p>
                  {copyFallback && (
                    <Textarea
                      aria-label="Invitation to copy"
                      readOnly
                      value={copyFallback}
                      className="mt-4"
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="empty">
                <Sprout size={36} className="mx-auto mb-4" />
                <h2 className="text-2xl mb-3">Your commons begins here.</h2>
                <p>
                  Save a place card to start planning. There are no sample
                  members or invented activity counts.
                </p>
              </div>
            )}
            <p className="status" role="status" aria-live="polite">
              {status}
            </p>
          </section>
        </div>
        <p className="small mt-8">
          This planner records intentions and observations. It does not verify
          ecological outcomes or issue carbon credits.{' '}
          <a
            className="underline"
            href="https://github.com/jdhart81/verge-common/blob/main/ROADMAP.md"
          >
            See what’s next ↗
          </a>
        </p>
      </main>
    </>
  );
}
