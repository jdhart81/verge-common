'use client';
import {
  currencies,
  toMinor,
  formatMoney,
  areaToSquareMetres,
} from '@/lib/international.mjs';
import { allocateCents } from '@/lib/network.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sprout,
  ArrowLeft,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Download,
  Users,
  MapPin,
  Copy,
  CheckCircle2,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
type Entity = { id: string; [key: string]: any };
type Field = {
  name: string;
  label: string;
  type?: 'textarea' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
  value?: string | number;
  optional?: boolean;
  max?: number;
  step?: string;
};
const date = (n: number) => new Date(n).toLocaleDateString();
const label = (s: string) => s.replaceAll('_', ' ');
function Status({ value }: { value: string }) {
  return <span className={`state-tag state-${value}`}>{label(value)}</span>;
}
function ActionForm({
  title,
  fields,
  submit,
  onSubmit,
  disabled = false,
}: {
  title?: string;
  fields: Field[];
  submit: string;
  onSubmit: (value: any) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="action-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError('');
        setBusy(true);
        const form = e.currentTarget;
        const raw = Object.fromEntries(new FormData(form));
        const data: Record<string, any> = { ...raw };
        for (const field of fields)
          if (field.type === 'number')
            data[field.name] = Number(raw[field.name]);
        try {
          const ok = await onSubmit(data);
          if (ok) form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {title && <h3>{title}</h3>}
      <fieldset disabled={busy || disabled}>
        {fields.map((f) => (
          <label key={f.name}>
            <span>
              {f.label}
              {f.optional ? ' (optional)' : ''}
            </span>
            {f.type === 'textarea' ? (
              <Textarea
                name={f.name}
                required={!f.optional}
                maxLength={f.max ?? 2000}
                defaultValue={f.value}
              />
            ) : f.type === 'select' ? (
              <NativeSelect
                name={f.name}
                required={!f.optional}
                defaultValue={f.value}
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {f.options?.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <Input
                name={f.name}
                type={f.type ?? 'text'}
                required={!f.optional}
                maxLength={f.max ?? 200}
                min={f.type === 'number' ? 0 : undefined}
                step={f.step ?? '1'}
                defaultValue={f.value}
              />
            )}
          </label>
        ))}
        <Button
          type="submit"
          className="h-11 px-4 mt-4"
          disabled={disabled || busy}
        >
          {busy ? 'Saving…' : submit}
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
const options = (items: Entity[], key = 'name') =>
  items.map((x) => ({
    value: x.id,
    label: x[key] ?? x.title ?? x.reference ?? x.id,
  }));
const field = (
  name: string,
  label: string,
  type?: Field['type'],
  rest: Partial<Field> = {},
): Field => ({ name, label, type, ...rest });
const select = (
  name: string,
  title: string,
  items: Entity[],
  key = 'name',
): Field => field(name, title, 'select', { options: options(items, key) });
const choices = (name: string, title: string, values: string[]): Field =>
  field(name, title, 'select', {
    options: values.map((v) => ({ value: v, label: label(v) })),
    value: values[0],
  });
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function NetworkApp({
  mode,
  signedIn,
}: {
  mode: 'network' | 'workspace';
  signedIn: boolean;
}) {
  const pendingRequests = useRef(new Map<string, string>());
  const [coops, setCoops] = useState<Entity[]>([]),
    [mine, setMine] = useState<Entity[]>([]),
    [selected, setSelected] = useState(''),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [workspaceTab, setWorkspaceTab] = useState('start'),
    [invitationLink, setInvitationLink] = useState(''),
    [next, setNext] = useState<number | null>(null);
  const load = useCallback(
    async (id = '') => {
      setLoading(true);
      setError('');
      try {
        const url =
          mode === 'network'
            ? `/api/network${id ? `?id=${encodeURIComponent(id)}` : ''}`
            : `/api/workspaces${id ? `?id=${encodeURIComponent(id)}` : ''}`;
        const r = await fetch(url, { cache: 'no-store' });
        const value: any = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (id) setData(value);
        else {
          setData(null);
          if (mode === 'network') {
            setCoops(value.coops);
            setNext(value.next);
          } else setMine(value.workspaces);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [mode],
  );
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('coop') ?? '';
    setSelected(id);
    void load(id);
  }, [load]);
  const chooseCoop = (id: string) => {
    setInvitationLink('');
    setWorkspaceTab('start');
    setSelected(id);
    history.replaceState(
      null,
      '',
      `${location.pathname}${id ? `?coop=${encodeURIComponent(id)}` : ''}`,
    );
    void load(id);
  };
  async function mutate(op: string, payload: any): Promise<boolean> {
    if (busy) throw new Error('Wait for the current save to finish.');
    setBusy(true);
    setNotice('');
    try {
      const requestKey = JSON.stringify({ selected, op, payload });
      const requestId =
        pendingRequests.current.get(requestKey) ?? crypto.randomUUID();
      pendingRequests.current.set(requestKey, requestId);
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: selected,
          version: data?.version,
          op,
          payload,
          requestId,
        }),
      });
      const result: any = await r.json();
      if (!r.ok) {
        if (r.status === 409) await load(selected);
        throw new Error(result.error);
      }
      pendingRequests.current.delete(requestKey);
      if (op === 'create') {
        chooseCoop(result.id);
      } else if (op === 'request_membership') {
        setNotice('Request saved. A steward will review your membership.');
      } else if (op === 'leave') {
        chooseCoop('');
      } else {
        setData(result);
        setNotice('Saved to the shared co-op record.');
      }
      return true;
    } finally {
      setBusy(false);
    }
  }
  async function quick(op: string, payload: any) {
    try {
      await mutate(op, payload);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function more() {
    if (next === null) return;
    try {
      const r = await fetch(`/api/network?before=${next}`);
      const v: any = await r.json();
      if (!r.ok) throw new Error(v.error);
      setCoops((c) => [...c, ...v.coops]);
      setNext(v.next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copyLink() {
    const url = `${location.origin}/network/?coop=${selected}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(
        'Public project link copied. Only explicitly public information is visible.',
      );
    } catch {
      setNotice(`Share this public link: ${url}`);
    }
  }
  const state = data?.state,
    steward = data?.role === 'steward';
  const money = (n: number) => formatMoney(n, state?.currency ?? 'USD');
  const exportRecords = () => {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              version: data.version,
              ...data,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verge-common-records.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      'Records exported. This file contains private co-op information. Store it securely.',
    );
  };
  const projectField = () =>
    select('projectId', 'Project', state?.projects ?? []);
  const evidenceField = () =>
    select(
      'evidenceId',
      'Reviewed evidence',
      state?.evidence.filter((e: Entity) => e.status === 'reviewed') ?? [],
      'title',
    );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <a className="brand" href="/">
          <Sprout />
          verge common
        </a>
        <nav aria-label="Main navigation">
          <a href="/network/">Discover</a>
          <a href="/workspace/" target="_top">
            My co-ops
          </a>
          {signedIn ? (
            <a href="/signout-with-chatgpt?return_to=/network/" target="_top">
              Sign out
            </a>
          ) : (
            <a href="/signin-with-chatgpt?return_to=/workspace/" target="_top">
              Sign in
            </a>
          )}
        </nav>
      </header>
      <main id="main" className="wrap network">
        <div className="section-head">
          <div>
            <p className="eyebrow">
              {mode === 'network'
                ? 'THE CONSERVATION NETWORK'
                : 'MEMBER WORKSPACE'}
            </p>
            <h1>
              {selected
                ? (state?.name ?? data?.coop?.name ?? 'Your co-op')
                : mode === 'network'
                  ? 'Find your common ground.'
                  : 'Build a living commons.'}
            </h1>
          </div>
          {selected ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => chooseCoop('')}
            >
              <ArrowLeft />
              All co-ops
            </Button>
          ) : mode === 'network' ? (
            <a className="button primary" href="/workspace/" target="_top">
              <Plus />
              Start a co-op
            </a>
          ) : (
            <a className="text-link" href="/network/">
              Explore the network <ArrowUpRight size={17} />
            </a>
          )}
        </div>
        {!selected && (
          <p className="intro">
            Bring an EcoHedge corridor, a woodlot, or a larger conservation
            project into a community that can care for it together.
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <Button
              variant="outline"
              className="ml-4"
              onClick={() => load(selected)}
            >
              Retry
            </Button>
          </div>
        )}
        {notice && (
          <p className="notice mt-5" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <div className="empty" role="status">
            Loading co-op records…
          </div>
        ) : mode === 'network' ? (
          <>
            {data?.coop ? (
              <>
                <p className="intro">{data.coop.summary}</p>
                {data.coop.organization && (
                  <OrganizationCard organization={data.coop.organization} />
                )}
                <div className="network-meta">
                  <span>
                    <MapPin size={17} />
                    {data.coop.region}
                  </span>
                  <span>
                    <Users size={17} />
                    {data.coop.memberCount} active members
                  </span>
                  <Button variant="outline" onClick={copyLink}>
                    <Copy />
                    Copy public link
                  </Button>
                </div>
                <div className="network-columns">
                  <section>
                    <h2>Conservation projects</h2>
                    {data.coop.projects.length === 0 ? (
                      <Empty>No projects have been made public yet.</Empty>
                    ) : (
                      data.coop.projects.map((p: Entity) => (
                        <article className="network-card" key={p.id}>
                          <p className="eyebrow">{label(p.kind)}</p>
                          <h3>{p.name}</h3>
                          <p>{p.summary}</p>
                          <div className="network-meta">
                            <span>{p.region}</span>
                            <Status value={p.status} />
                          </div>
                        </article>
                      ))
                    )}
                    <h2 className="mt-8">From the co-op</h2>
                    {data.coop.updates.length ? (
                      data.coop.updates.map((u: Entity) => (
                        <article className="network-card" key={u.id}>
                          <time>{date(u.createdAt)}</time>
                          <p>{u.text}</p>
                        </article>
                      ))
                    ) : (
                      <Empty>No public updates yet.</Empty>
                    )}
                  </section>
                  <aside className="panel">
                    {signedIn ? (
                      <ActionForm
                        title="Ask to join"
                        fields={[
                          field('name', 'Your public member name', undefined, {
                            max: 80,
                          }),
                        ]}
                        submit="Request membership"
                        onSubmit={(p) => mutate('request_membership', p)}
                        disabled={busy}
                      />
                    ) : (
                      <>
                        <h2>Take part</h2>
                        <p>
                          Join to help with projects, record observations, and
                          participate in co-op decisions.
                        </p>
                        <a
                          className="button primary"
                          href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/network/?coop=${selected}`)}`}
                          target="_top"
                        >
                          Sign in to request access
                        </a>
                      </>
                    )}
                    <p className="small mt-5">
                      Membership is approved by the co-op’s stewards. These are
                      software participation records, not automatic legal co-op
                      membership or investment rights.
                    </p>
                    <a
                      className="text-link"
                      href={`/workspace/?coop=${selected}`}
                    >
                      Already a member? Open workspace ↗
                    </a>
                  </aside>
                </div>
              </>
            ) : (
              <>
                <OrganizationDiscovery coops={coops} />
                <label className="search-label">
                  Find a co-op in the loaded results
                  <Input
                    placeholder="Search by name or general region…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="network-grid">
                  {coops
                    .filter((c) =>
                      `${c.name} ${c.country ?? ''} ${c.region} ${c.summary}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <article className="network-card" key={c.id}>
                        <p className="eyebrow">
                          <MapPin size={14} />
                          {c.region}
                        </p>
                        <h2>{c.name}</h2>
                        <p>{c.summary}</p>
                        <div className="network-meta">
                          <span>{c.projects.length} public projects</span>
                          <span>{c.memberCount} members</span>
                        </div>
                        <Button
                          className="mt-5 h-11"
                          onClick={() => chooseCoop(c.id)}
                        >
                          Explore this co-op <ArrowUpRight />
                        </Button>
                      </article>
                    ))}
                </div>
                {!coops.length && (
                  <Empty>
                    <Sprout size={36} className="mx-auto mb-4" />
                    <h2>Be the first to plant a flag.</h2>
                    <p>
                      No co-ops have made their profiles public yet. Start with
                      a real group and a place you care about.
                    </p>
                    <a
                      href="/workspace/"
                      target="_top"
                      className="button primary mt-4"
                    >
                      Create your co-op
                    </a>
                  </Empty>
                )}
                {next !== null && (
                  <Button variant="outline" onClick={more}>
                    Load more co-ops
                  </Button>
                )}
              </>
            )}
          </>
        ) : state ? (
          <>
            <div className="network-meta">
              <span>
                <MapPin size={16} />
                {state.region}
              </span>
              <Status value={state.visibility} />
              <span>Your role: {data.role}</span>
              <Button variant="outline" onClick={() => load(selected)}>
                <RefreshCw />
                Refresh
              </Button>
              <Button variant="outline" onClick={exportRecords}>
                <Download />
                Export records
              </Button>
              {state.visibility === 'public' && (
                <Button variant="outline" onClick={copyLink}>
                  <Copy />
                  Share co-op
                </Button>
              )}
            </div>
            <p className="small">
              Saved workspace · version {data.version}. Registry and bank
              actions happen outside Verge Common; reviewed records document
              those external actions.
            </p>
            {state.visibility === 'archived' && (
              <div className="notice">
                Archived. Existing records and authorized downloads remain
                available; changes are disabled.
              </div>
            )}
            <Tabs
              value={workspaceTab}
              onValueChange={(v) => setWorkspaceTab(String(v))}
              className="mt-6"
            >
              <TabsList className="coop-tabs">
                {[
                  'start',
                  'organizations',
                  'pooling',
                  'projects',
                  'parcels',
                  'members',
                  'agreements',
                  'evidence',
                  'governance',
                  'ledger',
                  'history',
                  'settings',
                ].map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {label(t)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="start">
                <h2>Your next steps</h2>
                <p>
                  Start with people and a place. Build the shared records as
                  your group grows.
                </p>
                <div className="network-grid">
                  {[
                    [
                      'projects',
                      '1. Add a place',
                      'Describe your EcoHedge, woodlot, or conservation project.',
                      state.projects.length > 0,
                    ],
                    [
                      'organizations',
                      '2. Connect locally',
                      'Find a land trust or nonprofit and add your organizer profile.',
                      !!state.organization,
                    ],
                    [
                      'members',
                      '3. Invite your circle',
                      'Invite participants; approve members and appoint a second steward.',
                      state.members.filter((m: Entity) => m.status === 'active')
                        .length > 1,
                    ],
                    [
                      'parcels',
                      '4. Bring land together',
                      'Record each parcel privately with its consent reference.',
                      state.parcels.length > 0,
                    ],
                    [
                      'pooling',
                      '5. Assess a carbon pathway',
                      'Document the chosen methodology, compatible land, and unresolved requirements.',
                      (state.assessments ?? []).some(
                        (a: Entity) => a.status === 'reviewed',
                      ),
                    ],
                    [
                      'governance',
                      '6. Agree on benefits',
                      'Show the proposed split, then let members vote on a frozen policy.',
                      state.charters.length > 0,
                    ],
                  ].map(([tab, title, description, complete]) => (
                    <article className="network-card" key={String(tab)}>
                      <p className="eyebrow">
                        {complete ? 'Recorded' : 'Next step'}
                      </p>
                      <h3>{title}</h3>
                      <p>{description}</p>
                      <Button
                        variant="outline"
                        onClick={() => setWorkspaceTab(String(tab))}
                      >
                        Open {String(tab)}
                      </Button>
                    </article>
                  ))}
                </div>
                <p className="notice mt-5">
                  These steps track your organizing progress. Easements, carbon
                  certification, and payments still require the relevant people
                  and institutions.
                </p>
              </TabsContent>
              <TabsContent value="organizations">
                <div className="network-columns">
                  <section>
                    <h2>Your organizing group</h2>
                    {state.organization ? (
                      <OrganizationCard organization={state.organization} />
                    ) : (
                      <Empty>
                        Add the group organizing this co-op. Do not list an
                        organization as a partner without its agreement.
                      </Empty>
                    )}
                    <OrganizationDiscovery coops={[]} />
                  </section>
                  <aside className="panel">
                    {steward && (
                      <ActionForm
                        title="Organization profile"
                        fields={[
                          field('name', 'Organization name', undefined, {
                            value: state.organization?.name,
                            max: 160,
                          }),
                          choices('kind', 'Organization type', [
                            'nonprofit',
                            'land_trust',
                            'community_group',
                          ]),
                          field('region', 'Service area', undefined, {
                            value: state.organization?.region ?? state.region,
                            max: 120,
                          }),
                          field(
                            'website',
                            'Official website (HTTPS)',
                            undefined,
                            { value: state.organization?.website, max: 500 },
                          ),
                          field(
                            'services',
                            'How people can take part',
                            'textarea',
                            { value: state.organization?.services, max: 1000 },
                          ),
                          choices('visibility', 'Profile visibility', [
                            'members',
                            'public',
                          ]),
                        ]}
                        submit="Save organization profile"
                        onSubmit={(v) => mutate('update_organization', v)}
                      />
                    )}
                    <p className="small mt-4">
                      Profiles are self-reported. Public profiles appear only
                      when the co-op itself is public. No affiliation is
                      independently verified by Verge Common.
                    </p>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="pooling">
                <h2>Bring compatible parcels into one pathway</h2>
                <p>
                  Reviewed parcels can be assessed together for a selected
                  program and methodology. An area total is a planning measure,
                  not a carbon-credit approval.
                </p>
                {steward ? (
                  <div className="network-columns">
                    <section>
                      {state.projects.map((p: Entity) => {
                        const parcels = state.parcels.filter(
                          (x: Entity) =>
                            x.projectId === p.id && x.status === 'reviewed',
                        );
                        return (
                          <article className="network-card" key={p.id}>
                            <h3>{p.name}</h3>
                            <p>
                              {parcels.length} reviewed parcels ·{' '}
                              {(
                                parcels.reduce(
                                  (n: number, x: Entity) =>
                                    n + x.areaSquareMetres,
                                  0,
                                ) / 10000
                              ).toLocaleString()}{' '}
                              hectares recorded
                            </p>
                            <p className="small">
                              Confirm boundaries do not overlap and each owner
                              has consented to this pathway.
                            </p>
                          </article>
                        );
                      })}
                      {(state.assessments ?? []).map((a: Entity) => (
                        <article className="network-card" key={a.id}>
                          <h3>
                            {a.program} · {a.methodology}
                          </h3>
                          <Status value={a.status} />
                          <p>
                            Snapshot: {a.areaSquareMetres.toLocaleString()} m²
                            across {a.parcelIds.length} reviewed parcels.
                          </p>
                          <p>
                            {a.areaSquareMetres >= a.minimumSquareMetres
                              ? 'Recorded area meets the entered planning threshold.'
                              : 'More compatible area is needed for the entered planning threshold.'}
                          </p>
                          <a href={a.source} target="_blank" rel="noreferrer">
                            Methodology reference ↗
                          </a>
                          <h4>Compatibility assessment</h4>
                          <p>{a.criteria}</p>
                          <h4>Unresolved requirements and next action</h4>
                          <p>{a.gaps}</p>
                          {a.status === 'submitted' && (
                            <ActionForm
                              fields={[
                                choices('decision', 'Review decision', [
                                  'approve',
                                  'reject',
                                ]),
                              ]}
                              submit="Record independent review"
                              onSubmit={(v) =>
                                mutate('review_assessment', { ...v, id: a.id })
                              }
                            />
                          )}
                        </article>
                      ))}
                    </section>
                    <aside className="panel">
                      <ActionForm
                        title="Record a pathway assessment"
                        fields={[
                          projectField(),
                          field('program', 'Carbon program'),
                          field('methodology', 'Methodology and version'),
                          field(
                            'source',
                            'Official methodology URL (HTTPS)',
                            undefined,
                            { max: 500 },
                          ),
                          field(
                            'minimumSquareMetres',
                            'Documented minimum area (m²; 0 if no minimum)',
                            'number',
                          ),
                          field(
                            'criteria',
                            'Assess geography, land use, ownership, additionality, permanence, monitoring, and non-overlapping boundaries',
                            'textarea',
                            { max: 4000 },
                          ),
                          field(
                            'gaps',
                            'Unresolved requirements, evidence needed, and next action',
                            'textarea',
                            { max: 4000 },
                          ),
                        ]}
                        submit="Save assessment for review"
                        onSubmit={(v) => mutate('record_assessment', v)}
                      />
                      <p className="small mt-4">
                        This saves the current reviewed-parcel snapshot. Create
                        a new assessment when land or methodology changes.
                        Another steward reviews your record; that review does
                        not certify eligibility or issue credits.
                      </p>
                    </aside>
                  </div>
                ) : (
                  <Empty>
                    Stewards manage pooling assessments because they contain
                    private land records. Ask a steward to discuss the pathway
                    with you.
                  </Empty>
                )}
              </TabsContent>
              <TabsContent value="projects">
                <div className="network-columns">
                  <section>
                    {state.projects.length === 0 && (
                      <Empty>
                        Add your first EcoHedge or conservation project.
                      </Empty>
                    )}
                    {state.projects.map((p: Entity) => (
                      <article className="network-card" key={p.id}>
                        <p className="eyebrow">
                          {label(p.kind)} · {p.region}
                        </p>
                        <h2>{p.name}</h2>
                        <p>{p.summary}</p>
                        <div className="network-meta">
                          <Status value={p.status} />
                          <Status value={p.visibility} />
                        </div>
                        {steward && (
                          <ActionForm
                            fields={[
                              choices('status', 'Project status', [
                                'proposed',
                                'active',
                                'completed',
                                'cancelled',
                              ]),
                              choices('visibility', 'Project visibility', [
                                'members',
                                'public',
                              ]),
                            ]}
                            submit="Update project"
                            onSubmit={(v) =>
                              mutate('project_status', { ...v, id: p.id })
                            }
                          />
                        )}
                        <div className="task-list">
                          {state.tasks
                            .filter((t: Entity) => t.projectId === p.id)
                            .map((t: Entity) => (
                              <div className="task-line" key={t.id}>
                                <div>
                                  <strong>{t.title}</strong>
                                  <span>
                                    {t.due ? `Due ${t.due} · ` : ''}
                                    {label(t.status)}
                                  </span>
                                </div>
                                <div className="button-row">
                                  {t.status === 'open' ? (
                                    <Button
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() =>
                                        quick('task_status', {
                                          id: t.id,
                                          status: 'claimed',
                                        })
                                      }
                                    >
                                      I’ll help
                                    </Button>
                                  ) : t.status === 'claimed' ? (
                                    <Button
                                      disabled={busy}
                                      onClick={() =>
                                        quick('task_status', {
                                          id: t.id,
                                          status: 'completed',
                                        })
                                      }
                                    >
                                      <CheckCircle2 />
                                      Complete
                                    </Button>
                                  ) : null}
                                  {t.status !== 'open' && (
                                    <Button
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() =>
                                        quick('task_status', {
                                          id: t.id,
                                          status: 'open',
                                        })
                                      }
                                    >
                                      Reopen
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                        <ActionForm
                          fields={[
                            field('title', 'A useful next action'),
                            field('due', 'Target date', 'date', {
                              optional: true,
                            }),
                          ]}
                          submit="Add action"
                          onSubmit={(v) =>
                            mutate('create_task', { ...v, projectId: p.id })
                          }
                        />
                      </article>
                    ))}
                    <h2 className="mt-8">Co-op updates</h2>
                    {state.updates.map((u: Entity) => (
                      <article className="network-card" key={u.id}>
                        <p className="small">
                          {u.author} · {date(u.createdAt)} ·{' '}
                          {u.hidden ? 'hidden' : u.visibility}
                        </p>
                        <p>{u.text}</p>
                        {steward && !u.hidden && (
                          <Button
                            variant="outline"
                            onClick={() => quick('hide_update', { id: u.id })}
                          >
                            Hide update
                          </Button>
                        )}
                      </article>
                    ))}
                  </section>
                  <aside>
                    <div className="panel">
                      <ActionForm
                        title="Start a project"
                        fields={[
                          field('name', 'Project name', undefined, {
                            max: 120,
                          }),
                          choices('kind', 'Project type', [
                            'ecohedge',
                            'landscape',
                            'restoration',
                          ]),
                          field('region', 'General area', undefined, {
                            max: 120,
                          }),
                          field(
                            'summary',
                            'Purpose and next steps',
                            'textarea',
                          ),
                        ]}
                        submit="Create private project"
                        onSubmit={(p) => mutate('create_project', p)}
                        disabled={busy}
                      />
                      <p className="small mt-4">
                        Keep exact parcel locations private. A steward can
                        publish the general project description.
                      </p>
                    </div>
                    {state.projects.length > 0 && (
                      <div className="panel mt-5">
                        <ActionForm
                          title="Share an update"
                          fields={[
                            projectField(),
                            field('text', 'What happened?', 'textarea'),
                            choices(
                              'visibility',
                              'Audience',
                              steward ? ['members', 'public'] : ['members'],
                            ),
                          ]}
                          submit="Post update"
                          onSubmit={(p) => mutate('post_update', p)}
                          disabled={busy}
                        />
                      </div>
                    )}
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="parcels">
                <div className="network-columns">
                  <section>
                    {state.parcels.length === 0 && (
                      <Empty>
                        Record land rights and consent before bringing a parcel
                        into a carbon pool.
                      </Empty>
                    )}
                    {state.parcels.map((p: Entity) => (
                      <article className="network-card" key={p.id}>
                        <h3>{p.name}</h3>
                        <p>
                          {(p.areaSquareMetres / 10000).toLocaleString()}{' '}
                          hectares
                        </p>
                        <p className="small">
                          Private land reference: {p.landReference}
                          <br />
                          Consent reference: {p.consentReference}
                        </p>
                        <p>{p.notes}</p>
                        <Status value={p.status} />
                        {steward && p.status === 'submitted' && (
                          <div className="button-row mt-4">
                            {['approve', 'reject'].map((decision) => (
                              <Button
                                key={decision}
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  quick('review_parcel', { id: p.id, decision })
                                }
                              >
                                {decision === 'approve'
                                  ? 'Record independent review'
                                  : 'Reject record'}
                              </Button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </section>
                  <aside className="panel">
                    <ActionForm
                      title="Submit private parcel record"
                      fields={[
                        projectField(),
                        field('name', 'Parcel name', undefined, { max: 120 }),
                        field(
                          'landReference',
                          'Private land-record reference',
                          undefined,
                          { max: 300 },
                        ),
                        field('area', 'Land area', 'number', { step: 'any' }),
                        choices('unit', 'Area unit', [
                          'hectares',
                          'acres',
                          'square_metres',
                        ]),
                        field(
                          'consentReference',
                          'Landowner consent reference',
                          undefined,
                          { max: 300 },
                        ),
                        field(
                          'notes',
                          'Rights, restrictions and access notes',
                          'textarea',
                          { optional: true },
                        ),
                      ]}
                      submit="Submit parcel for review"
                      onSubmit={(p) =>
                        mutate('record_parcel', {
                          ...p,
                          areaSquareMetres: areaToSquareMetres(p.area, p.unit),
                        })
                      }
                      disabled={busy || !state.projects.length}
                    />
                    <p className="small mt-5">
                      Only you and co-op stewards can view this record. It does
                      not map, convey, or verify land ownership automatically.
                    </p>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="members">
                {steward && (
                  <section className="panel mb-6">
                    <ActionForm
                      title="Invite someone to your co-op"
                      fields={[
                        field(
                          'label',
                          'Private reminder of who this is for',
                          undefined,
                          { max: 120 },
                        ),
                      ]}
                      submit="Create a single-use invitation"
                      onSubmit={async (v) => {
                        const response = await fetch('/api/invitations', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({
                            action: 'create',
                            id: selected,
                            label: v.label,
                          }),
                        });
                        const result: any = await response.json();
                        if (!response.ok) throw new Error(result.error);
                        setInvitationLink(location.origin + result.link);
                        await load(selected);
                        return true;
                      }}
                    />
                    <p className="small">
                      Expires after seven days. Whoever receives the link can
                      submit one request; a steward must still approve
                      membership. Share it privately. Site access restrictions
                      still apply.
                    </p>
                    {invitationLink && (
                      <label>
                        Copy this invitation before leaving
                        <Input
                          readOnly
                          value={invitationLink}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    )}
                    {(state.invitations ?? []).map((i: Entity) => (
                      <div className="network-meta" key={i.id}>
                        <span>
                          {i.label} ·{' '}
                          {i.revoked
                            ? 'Revoked'
                            : i.used
                              ? 'Request received'
                              : i.expiresAt <= Date.now()
                                ? 'Expired'
                                : `Expires ${date(i.expiresAt)}`}
                        </span>
                        {!i.used && !i.revoked && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              quick('revoke_invitation', { id: i.id })
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                <section className="panel mt-5">
                  <h2>People in the commons</h2>
                  <p className="small">
                    Invite people by sharing the public co-op link. No
                    invitations are sent automatically.
                  </p>
                  {state.members.map((m: Entity) => (
                    <div className="member-row" key={m.id}>
                      <div>
                        <strong>
                          {m.name}
                          {m.isYou ? ' (you)' : ''}
                        </strong>
                        <span>
                          {m.role} · {m.status}
                        </span>
                      </div>
                      <div className="button-row">
                        {steward && m.status === 'pending' && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                quick('member_status', {
                                  id: m.id,
                                  status: 'active',
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                quick('member_status', {
                                  id: m.id,
                                  status: 'rejected',
                                })
                              }
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {data.isOwner && !m.isYou && m.status === 'active' && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              quick('member_role', {
                                id: m.id,
                                role:
                                  m.role === 'steward' ? 'member' : 'steward',
                              })
                            }
                          >
                            {m.role === 'steward'
                              ? 'Make member'
                              : 'Appoint steward'}
                          </Button>
                        )}
                        {steward && !m.isYou && m.status === 'active' && (
                          <ConfirmAction
                            title={`Remove ${m.name}?`}
                            description="They will lose access to private records. Existing obligations and audit records remain. Only the founding steward can remove other stewards."
                            label="Remove access"
                            disabled={busy}
                            onConfirm={() =>
                              quick('member_status', {
                                id: m.id,
                                status: 'removed',
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="notice mt-5">
                    Evidence and financial records need a different steward to
                    review them. Appoint a trusted second steward before
                    progressing those records.
                  </p>
                </section>
              </TabsContent>
              <TabsContent value="agreements">
                <div className="network-columns">
                  <section>
                    {state.agreements.length === 0 && (
                      <Empty>
                        Your authorized agreement records will appear here.
                      </Empty>
                    )}
                    {state.agreements.map((a: Entity) => (
                      <article className="network-card" key={a.id}>
                        <p className="eyebrow">{label(a.kind)}</p>
                        <h3>
                          {
                            state.projects.find(
                              (p: Entity) => p.id === a.projectId,
                            )?.name
                          }
                        </h3>
                        <p>
                          {a.holder} · {a.jurisdiction}
                        </p>
                        <p>{a.notes}</p>
                        <Status value={a.status} />
                        {a.reference && (
                          <p>
                            <a
                              className="text-link"
                              href={a.reference}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Supporting reference ↗
                            </a>
                          </p>
                        )}
                        {a.reviewNote && (
                          <p className="small">Review: {a.reviewNote}</p>
                        )}
                        {a.executionReference && (
                          <p className="small">
                            Execution reference: {a.executionReference}
                            <br />
                            Recording reference:{' '}
                            {a.recordingReference || 'Not applicable'}
                          </p>
                        )}
                        {steward && a.status !== 'execution_recorded' && (
                          <ActionForm
                            fields={[
                              choices(
                                'status',
                                'Review outcome',
                                a.status === 'reviewed'
                                  ? ['changes_requested', 'execution_recorded']
                                  : ['changes_requested', 'reviewed'],
                              ),
                              field('note', 'Review notes', 'textarea'),
                              field(
                                'executionReference',
                                'Executed instrument reference',
                                undefined,
                                { optional: a.status !== 'reviewed', max: 300 },
                              ),
                              field(
                                'recordingReference',
                                'Recording reference (required for executed easements)',
                                undefined,
                                { optional: true, max: 300 },
                              ),
                            ]}
                            submit="Save review"
                            onSubmit={(p) =>
                              mutate('review_agreement', { ...p, id: a.id })
                            }
                            disabled={busy}
                          />
                        )}
                      </article>
                    ))}
                  </section>
                  <aside className="panel">
                    <ActionForm
                      title="Submit an agreement record"
                      fields={[
                        projectField(),
                        choices('kind', 'Instrument', [
                          'enrollment',
                          'easement',
                          'carbon_rights',
                        ]),
                        field('jurisdiction', 'Jurisdiction', undefined, {
                          max: 120,
                        }),
                        field(
                          'holder',
                          'Proposed holder / counterparty',
                          undefined,
                          { max: 160 },
                        ),
                        field(
                          'notes',
                          'Rights, obligations, and unresolved questions',
                          'textarea',
                          { max: 3000 },
                        ),
                        field(
                          'reference',
                          'Private HTTPS document reference',
                          undefined,
                          { optional: true, max: 1500 },
                        ),
                      ]}
                      submit="Submit for review"
                      onSubmit={(p) => mutate('submit_agreement', p)}
                      disabled={busy || !state.projects.length}
                    />
                    <p className="small mt-5">
                      Records are visible to the submitter and stewards.
                      Recording an execution reference does not execute or
                      legally validate an instrument.
                    </p>
                    <a
                      href="https://github.com/jdhart81/verge-common/tree/main/templates"
                      className="text-link"
                    >
                      Open agreement templates ↗
                    </a>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="evidence">
                <div className="network-columns">
                  <section>
                    {state.evidence.length === 0 && (
                      <Empty>No evidence visible to you yet.</Empty>
                    )}
                    {state.evidence.map((e: Entity) => (
                      <article className="network-card" key={e.id}>
                        <h3>{e.title}</h3>
                        <p className="small">
                          {e.method} · {e.period}
                        </p>
                        <p>{e.notes}</p>
                        <Status value={e.status} />
                        {e.asset && (
                          <>
                            <p>
                              <a
                                href={`/api/files?id=${e.asset.id}`}
                                className="text-link"
                              >
                                <Download size={16} />
                                {e.asset.filename}
                              </a>
                            </p>
                            <p className="digest">SHA-256: {e.asset.sha256}</p>
                          </>
                        )}
                        {e.reference && (
                          <a
                            className="text-link"
                            href={e.reference}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Evidence reference ↗
                          </a>
                        )}
                        {e.reviewNote && (
                          <p className="small mt-3">{e.reviewNote}</p>
                        )}
                        {steward && e.status === 'submitted' && (
                          <ActionForm
                            fields={[
                              choices('decision', 'Decision', [
                                'approve',
                                'reject',
                              ]),
                              field('note', 'Review basis', 'textarea'),
                            ]}
                            submit="Record independent review"
                            onSubmit={(p) =>
                              mutate('review_evidence', { ...p, id: e.id })
                            }
                          />
                        )}
                      </article>
                    ))}
                  </section>
                  <aside className="panel">
                    <EvidenceForm
                      workspaceId={selected}
                      projects={state.projects}
                      disabled={busy}
                      onSubmit={(p) => mutate('submit_evidence', p)}
                    />
                    <p className="small mt-5">
                      Files are private to the uploader and stewards. Review
                      records document a human review; they do not constitute
                      carbon-program verification.
                    </p>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="governance">
                <PayoutPreview
                  currency={state.currency ?? 'USD'}
                  members={state.members.filter(
                    (m: Entity) => m.status === 'active',
                  )}
                />
                <div className="network-columns">
                  <section>
                    {state.proposals.length === 0 && (
                      <Empty>
                        Adopt a versioned allocation policy with a recorded
                        member vote.
                      </Empty>
                    )}
                    {state.proposals.map((p: Entity) => (
                      <article className="network-card" key={p.id}>
                        <h3>{p.title}</h3>
                        <p>{p.text}</p>
                        <Status value={p.status} />
                        <p className="small">
                          {p.votes.length} of {p.electorate.length} votes ·
                          closes {new Date(p.closesAt).toLocaleString()} ·
                          quorum {p.quorum}
                        </p>
                        <dl className="ledger">
                          {p.shares.map((m: Entity) => (
                            <div key={m.id}>
                              <dt>{m.name}</dt>
                              <dd>{m.shareBps / 100}%</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="small mt-3">
                          Stewardship {p.stewardshipBps / 100}% · treasury{' '}
                          {p.treasuryBps / 100}% of settled proceeds. Member
                          shares apply to the remainder.
                        </p>
                        {p.status === 'open' && (
                          <>
                            <div className="button-row mt-4">
                              {['approve', 'oppose', 'abstain'].map(
                                (choice) => (
                                  <Button
                                    variant={
                                      p.votes.find(
                                        (v: any) =>
                                          v.memberId === data.memberId,
                                      )?.choice === choice
                                        ? 'default'
                                        : 'outline'
                                    }
                                    key={choice}
                                    disabled={busy}
                                    onClick={() =>
                                      quick('vote', { id: p.id, choice })
                                    }
                                  >
                                    {label(choice)}
                                  </Button>
                                ),
                              )}
                            </div>
                            {steward && (
                              <Button
                                variant="outline"
                                className="mt-4"
                                disabled={busy}
                                onClick={() =>
                                  quick('close_proposal', { id: p.id })
                                }
                              >
                                Close and tally
                              </Button>
                            )}
                          </>
                        )}
                      </article>
                    ))}
                  </section>
                  <aside className="panel">
                    {steward ? (
                      <ActionForm
                        title="Propose allocation charter"
                        fields={[
                          field('title', 'Policy title'),
                          field(
                            'text',
                            'Policy and member obligations',
                            'textarea',
                            { max: 4000 },
                          ),
                          field('days', 'Voting period (days)', 'number', {
                            value: 7,
                          }),
                          field(
                            'stewardshipPercent',
                            'Stewardship budget (%)',
                            'number',
                            { value: 15, step: '0.01' },
                          ),
                          field(
                            'treasuryPercent',
                            'Treasury reserve (%)',
                            'number',
                            { value: 10, step: '0.01' },
                          ),
                          ...state.members
                            .filter((m: Entity) => m.status === 'active')
                            .map((m: Entity) =>
                              field(
                                `share_${m.id}`,
                                `${m.name}: member-pool share (%)`,
                                'number',
                                { value: 0, step: '0.01' },
                              ),
                            ),
                        ]}
                        submit="Open member vote"
                        onSubmit={(p) =>
                          mutate('propose_charter', {
                            title: p.title,
                            text: p.text,
                            days: p.days,
                            stewardshipBps: Math.round(
                              p.stewardshipPercent * 100,
                            ),
                            treasuryBps: Math.round(p.treasuryPercent * 100),
                            shares: state.members
                              .filter((m: Entity) => m.status === 'active')
                              .map((m: Entity) => ({
                                id: m.id,
                                shareBps: Math.round(p[`share_${m.id}`] * 100),
                              })),
                          })
                        }
                        disabled={busy}
                      />
                    ) : (
                      <p>
                        Stewards propose policy; eligible members vote here.
                      </p>
                    )}
                    <p className="small mt-5">
                      The electorate is frozen when a proposal opens. Adoption
                      requires two-thirds participation and approval by more
                      than half of that electorate. Voting closes at the
                      deadline, or early once everyone has voted.
                    </p>
                    <p className="notice mt-4">
                      An adopted software policy does not establish a legal
                      co-op or replace its legally required governance.
                    </p>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="ledger">
                <Ledger
                  state={state}
                  steward={steward}
                  busy={busy}
                  mutate={mutate}
                  quick={quick}
                />
              </TabsContent>
              <TabsContent value="history">
                <section className="panel mt-5">
                  <h2>Application audit history</h2>
                  <p className="small">
                    Changes are appended with a sequence and linked hashes. This
                    is an application audit trail, not independently notarized
                    proof.
                  </p>
                  {[...state.audit].reverse().map((a: Entity) => (
                    <div className="audit-row" key={a.id}>
                      <strong>
                        #{a.sequence} · {label(a.action)}
                      </strong>
                      <span>
                        {a.actor} · {new Date(a.at).toLocaleString()}
                      </span>
                      <code>{a.hash}</code>
                    </div>
                  ))}
                  {!state.audit.length && (
                    <Empty>No changes recorded yet.</Empty>
                  )}
                </section>
              </TabsContent>
              <TabsContent value="settings">
                {steward && (
                  <section className="panel mb-6">
                    <ActionForm
                      title="Country and accounting currency"
                      fields={[
                        field('country', 'Country or territory', undefined, {
                          value: state.country,
                          max: 120,
                        }),
                        field(
                          'currency',
                          'Co-op accounting currency',
                          'select',
                          {
                            value: state.currency ?? 'USD',
                            options: currencies.map((c) => ({
                              value: c,
                              label: c,
                            })),
                          },
                        ),
                      ]}
                      submit="Save regional settings"
                      onSubmit={(v) => mutate('update_regional_settings', v)}
                    />
                    <p className="small mt-4">
                      Choose before recording proceeds. Each co-op uses one
                      currency, locked after its first settlement. No currency
                      conversion is performed. Legal documents must be adapted
                      for your jurisdiction.
                    </p>
                  </section>
                )}

                <section className="panel mt-5">
                  {steward ? (
                    <ActionForm
                      title="Co-op profile and visibility"
                      fields={[
                        field('name', 'Co-op name', undefined, {
                          value: state.name,
                          max: 120,
                        }),
                        field('region', 'General region', undefined, {
                          value: state.region,
                          max: 120,
                        }),
                        field('summary', 'Public introduction', 'textarea', {
                          value: state.summary,
                          max: 1000,
                        }),
                        {
                          ...choices('visibility', 'Profile visibility', [
                            'private',
                            'public',
                          ]),
                          value:
                            state.visibility === 'public'
                              ? 'public'
                              : 'private',
                        },
                      ]}
                      submit="Save profile"
                      onSubmit={(p) => mutate('update_coop', p)}
                      disabled={busy || state.visibility === 'archived'}
                    />
                  ) : (
                    <p>Your stewards manage the co-op profile.</p>
                  )}
                  <div className="mt-8">
                    <h2>Legal authority record</h2>
                    {state.authority ? (
                      <>
                        <p>
                          {state.authority.legalName} ·{' '}
                          {state.authority.jurisdiction}
                        </p>
                        <p className="small">{state.authority.reference}</p>
                        <Status value={state.authority.status} />
                        {steward && state.authority.status === 'submitted' && (
                          <div className="button-row mt-4">
                            {['approve', 'reject'].map((decision) => (
                              <Button
                                variant="outline"
                                key={decision}
                                disabled={busy}
                                onClick={() =>
                                  quick('review_authority', { decision })
                                }
                              >
                                {decision === 'approve'
                                  ? 'Record independent authority review'
                                  : 'Reject authority record'}
                              </Button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="small">
                        No external legal authority has been recorded. Issued
                        holding records stay blocked.
                      </p>
                    )}
                    {steward && state.authority?.status !== 'reviewed' && (
                      <ActionForm
                        fields={[
                          field(
                            'legalName',
                            'Legal co-op / project-holder name',
                          ),
                          field('jurisdiction', 'Jurisdiction'),
                          field(
                            'reference',
                            'Formation / authority document reference',
                            undefined,
                            { max: 300 },
                          ),
                          evidenceField(),
                        ]}
                        submit="Submit authority record"
                        onSubmit={(p) => mutate('record_authority', p)}
                        disabled={busy}
                      />
                    )}
                    <p className="small mt-4">
                      This records human review of external documents. It does
                      not form a legal entity.
                    </p>
                  </div>
                  <p className="notice mt-5">
                    Public profiles expose the introduction, general region,
                    active member count, and explicitly public projects/updates.
                    Agreements, evidence, identities, votes, and financial
                    records remain restricted.
                  </p>
                  <div className="mt-7">
                    {data.isOwner ? (
                      <ConfirmAction
                        title="Archive this co-op?"
                        description="This stops all further changes and removes the co-op from discovery. Authorized members can still read and export retained records. Archival is permanent in this release."
                        label="Archive co-op"
                        disabled={busy || state.visibility === 'archived'}
                        onConfirm={() => quick('archive', {})}
                      />
                    ) : (
                      <ConfirmAction
                        title="Leave this workspace?"
                        description="You will lose access to private workspace records. Existing audit, agreement and financial records remain with the co-op. This does not release any legal obligation."
                        label="Leave workspace"
                        disabled={busy}
                        onConfirm={() => quick('leave', {})}
                      />
                    )}
                  </div>
                  <a href="/coop/" className="text-link mt-5">
                    Explore the separate hypothetical accounting workbench ↗
                  </a>
                </section>
              </TabsContent>
            </Tabs>
          </>
        ) : data?.membershipStatus ? (
          <Empty>
            <h2>{data.name}</h2>
            <p>
              Your membership status is {label(data.membershipStatus)}. A
              steward manages access.
            </p>
            <Button onClick={() => load(selected)}>Refresh status</Button>
          </Empty>
        ) : (
          <div className="network-columns">
            <section>
              <h2>Your co-ops</h2>
              {mine.map((c) => (
                <article className="network-card" key={c.id}>
                  <h3>{c.name}</h3>
                  <p>{c.region}</p>
                  <Status value={c.visibility} />
                  <Button
                    className="mt-4 h-11"
                    onClick={() => chooseCoop(c.id)}
                  >
                    Open workspace
                  </Button>
                </article>
              ))}
              {!mine.length && (
                <Empty>
                  No co-ops yet. Create one for your group, or request
                  membership through a public co-op page.
                </Empty>
              )}
            </section>
            <aside className="panel">
              <ActionForm
                title="Start a co-op workspace"
                fields={[
                  field('name', 'Co-op name', undefined, { max: 120 }),
                  field('region', 'General region', undefined, { max: 120 }),
                  field('summary', 'Conservation purpose', 'textarea', {
                    max: 1000,
                  }),
                  field('country', 'Country or territory', undefined, {
                    max: 120,
                  }),
                  field('currency', 'Accounting currency', 'select', {
                    value: 'USD',
                    options: currencies.map((c) => ({ value: c, label: c })),
                  }),
                  field('displayName', 'Your member display name', undefined, {
                    max: 80,
                  }),
                ]}
                submit="Create private workspace"
                onSubmit={(p) => mutate('create', p)}
                disabled={busy}
              />
              <p className="small mt-5">
                You become the founding steward. This creates a software
                workspace, not a legal entity. Publish the co-op profile when
                you are ready to invite members.
              </p>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
function EvidenceForm({
  workspaceId,
  projects,
  disabled,
  onSubmit,
}: {
  workspaceId: string;
  projects: Entity[];
  disabled: boolean;
  onSubmit: (p: any) => Promise<boolean>;
}) {
  const [asset, setAsset] = useState<any>(null),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState('');
  return (
    <>
      <h2>Submit evidence</h2>
      <label className="upload-label">
        Private file (optional)
        <Input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
          disabled={uploading || disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setAsset(null);
            if (!f) return;
            setUploading(true);
            setMessage('');
            try {
              const form = new FormData();
              form.append('file', f);
              const r = await fetch(`/api/files?workspace=${workspaceId}`, {
                method: 'POST',
                body: form,
              });
              const result: any = await r.json();
              if (!r.ok) throw new Error(result.error);
              setAsset(result);
              setMessage(
                `Uploaded ${result.filename}. Complete the evidence form to attach it.`,
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <p className="small" role="status">
        {uploading ? 'Uploading…' : message}
      </p>
      <ActionForm
        fields={[
          select('projectId', 'Project', projects),
          field('title', 'Evidence title', undefined, { max: 160 }),
          field('method', 'Method or review basis'),
          field('period', 'Observation / reporting period', undefined, {
            max: 80,
          }),
          field('reference', 'HTTPS evidence reference', undefined, {
            optional: !!asset,
            max: 1500,
          }),
          field('notes', 'What does this evidence establish?', 'textarea'),
        ]}
        submit="Submit evidence"
        disabled={disabled || uploading || !projects.length}
        onSubmit={async (p) => {
          const ok = await onSubmit({ ...p, assetId: asset?.id });
          if (ok) {
            setAsset(null);
            setMessage('Evidence submitted.');
          }
          return ok;
        }}
      />
    </>
  );
}
function Ledger({
  state,
  steward,
  busy,
  mutate,
  quick,
}: {
  state: any;
  steward: boolean;
  busy: boolean;
  mutate: (op: string, p: any) => Promise<boolean>;
  quick: (op: string, p: any) => Promise<void>;
}) {
  const money = (n: number) => formatMoney(n, state.currency ?? 'USD');
  const reviewed = state.evidence.filter(
    (e: Entity) => e.status === 'reviewed',
  );
  const evidence = () =>
    select('evidenceId', 'Reviewed supporting evidence', reviewed, 'title');
  const review = (kind: string, r: Entity) => (
    <div className="button-row mt-4">
      {steward &&
        r.status === 'submitted' &&
        ['approve', 'reject'].map((decision) => (
          <Button
            variant="outline"
            key={decision}
            disabled={busy}
            onClick={() => quick(`review_${kind}`, { id: r.id, decision })}
          >
            {decision === 'approve'
              ? 'Confirm independent review'
              : 'Reject record'}
          </Button>
        ))}
    </div>
  );
  return (
    <>
      <div className="notice mt-5">
        External records only. Verge Common does not issue credits, execute
        registry transfers, or send payments. Stewards record and independently
        review supporting receipts. Amounts below come from those records.
      </div>
      <Tabs defaultValue="holdings" className="mt-5">
        <TabsList className="coop-tabs">
          {['holdings', 'settlements', 'allocations', 'retirements'].map(
            (t) => (
              <TabsTrigger key={t} value={t}>
                {label(t)}
              </TabsTrigger>
            ),
          )}
        </TabsList>
        <TabsContent value="holdings">
          <div className="network-columns">
            <section>
              {state.lots.map((l: Entity) => (
                <article className="network-card" key={l.id}>
                  <h3>
                    {l.registry} · {l.program}
                  </h3>
                  <p>
                    {l.method} · vintage {l.vintage}
                  </p>
                  <p>{l.units} units (tCO₂e)</p>
                  <p className="small">
                    Serials {l.serialPrefix} {l.serialStart}–{l.serialEnd}
                    <br />
                    Issuance receipt: {l.reference}
                  </p>
                  <Status value={l.status} />
                  {review('lot', l)}
                </article>
              ))}
              {!state.lots.length && (
                <Empty>
                  No external issuance records. Scenario quantities are never
                  imported as issued holdings.
                </Empty>
              )}
            </section>
            {steward && (
              <aside className="panel">
                <ActionForm
                  title="Record external issued holding"
                  fields={[
                    select('projectId', 'Project', state.projects),
                    field('registry', 'Registry'),
                    field('program', 'Program'),
                    field('method', 'Methodology'),
                    field('vintage', 'Vintage', undefined, { max: 20 }),
                    field('serialPrefix', 'Full serial namespace/prefix'),
                    field('serialStart', 'Serial start', 'number'),
                    field('serialEnd', 'Serial end', 'number'),
                    field(
                      'reference',
                      'External issuance receipt reference',
                      undefined,
                      { max: 300 },
                    ),
                    evidence(),
                  ]}
                  submit="Submit holding record"
                  onSubmit={(p) => mutate('record_lot', p)}
                  disabled={busy}
                />
                <p className="small mt-5">
                  Only whole one-tonne serialized units are supported. The co-op
                  must actually hold the recorded rights. Matching serials
                  across co-ops still require an external registry check.
                </p>
              </aside>
            )}
          </div>
        </TabsContent>
        <TabsContent value="settlements">
          <div className="network-columns">
            <section>
              {state.settlements.map((s: Entity) => (
                <article className="network-card" key={s.id}>
                  <h3>
                    {money(s.cents)} · {s.units} units
                  </h3>
                  <p>{s.reference}</p>
                  <Status value={s.status} />
                  {review('settlement', s)}
                </article>
              ))}
              {!state.settlements.length && (
                <Empty>No external settled-cash records.</Empty>
              )}
            </section>
            {steward && (
              <aside className="panel">
                <ActionForm
                  title="Record an external settlement"
                  fields={[
                    select(
                      'lotId',
                      'Reviewed holding',
                      state.lots.filter((l: Entity) => l.status === 'reviewed'),
                      'reference',
                    ),
                    field('units', 'Transferred units', 'number'),
                    field(
                      'amount',
                      `Settled amount (${state.currency ?? 'USD'})`,
                    ),
                    field(
                      'reference',
                      'Unique bank / settlement reference',
                      undefined,
                      { max: 300 },
                    ),
                    evidence(),
                  ]}
                  submit="Submit settlement record"
                  onSubmit={(p) =>
                    mutate('record_settlement', {
                      ...p,
                      cents: toMinor(p.amount, state.currency ?? 'USD'),
                    })
                  }
                  disabled={busy}
                />
                <p className="small mt-5">
                  Use actual settled proceeds and transfer evidence. Submitted
                  records reserve their quantity internally to prevent a second
                  allocation of those units while review is pending.
                </p>
              </aside>
            )}
          </div>
        </TabsContent>
        <TabsContent value="allocations">
          <div className="network-columns">
            <section>
              {state.allocations.map((a: Entity) => (
                <article className="network-card" key={a.id}>
                  <h3>Allocation · {money(a.amounts.grossCents)}</h3>
                  <Status value={a.status} />
                  <dl className="ledger">
                    <div>
                      <dt>Stewardship</dt>
                      <dd>{money(a.amounts.stewardshipCents)}</dd>
                    </div>
                    <div>
                      <dt>Treasury reserve</dt>
                      <dd>{money(a.amounts.treasuryCents)}</dd>
                    </div>
                    <div>
                      <dt>Platform percentage cut</dt>
                      <dd>{money(0)}</dd>
                    </div>
                    {a.amounts.members.map((m: Entity) => (
                      <div key={m.id}>
                        <dt>{m.name}</dt>
                        <dd>{money(m.cents)}</dd>
                      </div>
                    ))}
                  </dl>
                  {steward && a.status === 'draft' && (
                    <Button
                      className="mt-4"
                      disabled={busy}
                      onClick={() => quick('approve_allocation', { id: a.id })}
                    >
                      Approve allocation
                    </Button>
                  )}
                  {a.payments.map((p: Entity) => (
                    <div className="network-card" key={p.id}>
                      <p>
                        {
                          a.amounts.members.find(
                            (m: Entity) => m.id === p.memberId,
                          )?.name
                        }{' '}
                        · {money(p.cents)}
                      </p>
                      <p className="small">
                        External payment receipt: {p.reference}
                      </p>
                      <Status value={p.status} />
                      {steward && p.status === 'submitted' && (
                        <div className="button-row">
                          {['approve', 'reject'].map((decision) => (
                            <Button
                              variant="outline"
                              key={decision}
                              disabled={busy}
                              onClick={() =>
                                quick('review_payment', {
                                  id: a.id,
                                  paymentId: p.id,
                                  decision,
                                })
                              }
                            >
                              {decision === 'approve'
                                ? 'Confirm receipt review'
                                : 'Reject receipt'}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {steward && a.status === 'approved' && (
                    <ActionForm
                      title="Record a completed external member payment"
                      fields={[
                        select(
                          'memberId',
                          'Member',
                          a.amounts.members.filter(
                            (m: Entity) =>
                              m.cents > 0 &&
                              !a.payments.some(
                                (p: Entity) =>
                                  p.memberId === m.id &&
                                  p.status !== 'rejected',
                              ),
                          ),
                        ),
                        field(
                          'reference',
                          'Unique external payment reference',
                          undefined,
                          { max: 300 },
                        ),
                        evidence(),
                      ]}
                      submit="Submit payment receipt"
                      onSubmit={(p) =>
                        mutate('record_payment', { ...p, id: a.id })
                      }
                      disabled={busy}
                    />
                  )}
                </article>
              ))}
              {!state.allocations.length && (
                <Empty>
                  Allocations require a reviewed settlement and an adopted
                  charter.
                </Empty>
              )}
            </section>
            {steward && (
              <aside className="panel">
                <ActionForm
                  title="Allocate reconciled proceeds"
                  fields={[
                    select(
                      'settlementId',
                      'Reviewed settlement',
                      state.settlements.filter(
                        (s: Entity) => s.status === 'reviewed',
                      ),
                      'reference',
                    ),
                    select(
                      'charterId',
                      'Adopted charter',
                      state.charters.map((c: Entity) => ({
                        ...c,
                        name: `Charter version ${c.version}`,
                      })),
                    ),
                  ]}
                  submit="Create exact allocation"
                  onSubmit={(p) => mutate('create_allocation', p)}
                  disabled={busy}
                />
                <p className="small mt-5">
                  One allocation per settlement. A second steward must approve
                  it before external payment receipts can be recorded. No
                  payment instruction is sent by this form.
                </p>
              </aside>
            )}
          </div>
        </TabsContent>
        <TabsContent value="retirements">
          <div className="network-columns">
            <section>
              {state.retirements.map((r: Entity) => (
                <article className="network-card" key={r.id}>
                  <h3>
                    {r.units} units · {r.beneficiary}
                  </h3>
                  <p>{r.reference}</p>
                  <Status value={r.status} />
                  {review('retirement', r)}
                </article>
              ))}
              {!state.retirements.length && (
                <Empty>No external retirement receipts recorded.</Empty>
              )}
            </section>
            {steward && (
              <aside className="panel">
                <ActionForm
                  title="Record an external retirement"
                  fields={[
                    select(
                      'settlementId',
                      'Reviewed transfer / settlement',
                      state.settlements.filter(
                        (s: Entity) => s.status === 'reviewed',
                      ),
                      'reference',
                    ),
                    field('units', 'Retired units', 'number'),
                    field('beneficiary', 'Beneficiary'),
                    field(
                      'reference',
                      'Registry retirement reference',
                      undefined,
                      { max: 300 },
                    ),
                    evidence(),
                  ]}
                  submit="Submit retirement record"
                  onSubmit={(p) => mutate('record_retirement', p)}
                  disabled={busy}
                />
              </aside>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ConfirmAction({
  title,
  description,
  label,
  disabled,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setOpen(false);
                await onConfirm();
              }}
            >
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrganizationCard({ organization: o }: { organization: any }) {
  return (
    <article className="network-card">
      <p className="eyebrow">{label(o.kind)} · Self-reported profile</p>
      <h3>{o.name}</h3>
      <p>{o.region}</p>
      <p>{o.services}</p>
      <a
        className="text-link"
        href={o.website}
        target="_blank"
        rel="noreferrer"
      >
        Visit organization website ↗
      </a>
    </article>
  );
}
function OrganizationDiscovery({ coops }: { coops: Entity[] }) {
  const [region, setRegion] = useState('');
  const organizations = coops.filter(
    (c) =>
      c.organization &&
      `${c.organization.name} ${c.organization.region} ${c.organization.services}`
        .toLowerCase()
        .includes(region.toLowerCase()),
  );
  return (
    <section className="panel mb-6">
      <h2>Connect with conservation anywhere</h2>
      <label>
        Country, territory, town, or region
        <Input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="For example: Kisumu, Kenya; Kerala, India; or your region"
          maxLength={120}
        />
      </label>
      <div className="network-meta mt-4">
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href={`https://www.google.com/search?q=${encodeURIComponent(`conservation nonprofit land trust ${region}`)}`}
        >
          Search the web for local groups ↗
        </a>
        <a
          className="text-link"
          href="https://landtrustalliance.org/land-trusts"
          target="_blank"
          rel="noreferrer"
        >
          United States: land trust directory ↗
        </a>
      </div>
      <p className="small">
        External search results are not verified partners. Use the
        organization’s official contact details to introduce your project.
      </p>
      {organizations.length > 0 && (
        <>
          <h3 className="mt-5">Organizers in the loaded network</h3>
          <div className="network-grid">
            {organizations.map((c) => (
              <div key={c.id}>
                <OrganizationCard organization={c.organization} />
                <a className="text-link" href={`/network/?coop=${c.id}`}>
                  Explore their co-op ↗
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function PayoutPreview({
  members,
  currency,
}: {
  members: Entity[];
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const [receipt, setReceipt] = useState('1000'),
    [care, setCare] = useState('15'),
    [reserve, setReserve] = useState('10'),
    [shares, setShares] = useState<Record<string, string>>({});
  let result: any = null,
    error = '';
  try {
    const amounts = [care, reserve, ...members.map((m) => shares[m.id] ?? '')];
    if (amounts.some((v) => !/^\d+(\.\d{1,2})?$/.test(v)))
      throw new Error(
        'Enter amounts and each member share using at most two decimal places. Member shares must total 100%.',
      );
    result = allocateCents(
      toMinor(receipt, currency),
      members.map((m) => ({
        id: m.id,
        name: m.name,
        shareBps: Math.round(Number(shares[m.id]) * 100),
      })),
      Math.round(Number(care) * 100),
      Math.round(Number(reserve) * 100),
    );
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section className="panel mb-6">
      <h2>Work out a fair distribution</h2>
      <p>
        Try a receipt and an agreed share for each member. Discuss land
        contribution, stewardship work, costs, and ongoing obligations before
        proposing a policy below.
      </p>
      <div className="network-grid">
        {[
          [`Example proceeds (${currency})`, receipt, setReceipt],
          ['Stewardship budget (%)', care, setCare],
          ['Reserve (%)', reserve, setReserve],
        ].map(([title, value, setter]) => (
          <label key={String(title)}>
            {String(title)}
            <Input
              type="number"
              min="0"
              step="any"
              value={String(value)}
              onChange={(e) => (setter as (s: string) => void)(e.target.value)}
            />
          </label>
        ))}
        {members.map((m) => (
          <label key={m.id}>
            {m.name}: share of member pool (%)
            <Input
              type="number"
              min="0"
              max="100"
              step="any"
              value={shares[m.id] ?? ''}
              onChange={(e) => setShares({ ...shares, [m.id]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {result ? (
        <div className="notice mt-4">
          <p>
            Stewardship {money(result.stewardshipCents)} · Reserve{' '}
            {money(result.treasuryCents)} · Member pool{' '}
            {money(result.memberPoolCents)}
          </p>
          {result.members.map((m: any) => (
            <p key={m.id}>
              {m.name}: {money(m.cents)}
            </p>
          ))}
        </div>
      ) : (
        <p className="small mt-4" role="status">
          {error}
        </p>
      )}
      <p className="small mt-4">
        Illustration only; nothing is saved or paid. Enter the agreed
        percentages in the proposal below. An adopted policy freezes those
        shares for later allocations.
      </p>
    </section>
  );
}
