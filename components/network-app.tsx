'use client';
import { BrandLogo } from '@/components/brand-logo';
import {
  currencies,
  toMinor,
  formatMoney,
  areaToSquareMetres,
} from '@/lib/international.mjs';
import {
  MonitoringBoard,
  type MonitoringState,
  type MonitoringParcel,
  type MonitoringBoundary,
} from '@/components/monitoring-board';
import {
  CommunityBoard,
  PublicEvents,
  type CommunityState,
  type CommunityEvent,
} from '@/components/community-board';
import { allocateCents } from '@/lib/network.mjs';
import { allocationReconciliation } from '@/lib/allocation-reconciliation.mjs';
import { startWorkspaceRefresh } from '@/lib/workspace-refresh.mjs';
import { conversationActions } from '@/lib/conversation-actions.mjs';
import { ConversationJourney } from '@/components/conversation-journey';
import { CooperativeParcelMap } from '@/components/cooperative-parcel-map';
import { onboardingProgress } from '@/lib/onboarding.mjs';
import { PendingWork } from '@/components/pending-work';
import {
  PartnerParticipation,
  type ParticipationPartner,
} from '@/components/partner-participation';
import {
  WorkspaceCapacityBanner,
  type WorkspaceCapacityStatus,
} from '@/components/workspace-capacity-banner';
import {
  assessmentIsCurrent,
  projectReadiness,
  parcelConsentIsCurrent,
  agreementIsCurrent,
} from '@/lib/readiness.mjs';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { ControlLabel } from '@/components/ui/label';
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
type NamedRecord = {
  id: string;
  name?: string;
  title?: string;
  reference?: string;
};
type ReviewRecord = { id: string; status: string; canReview?: boolean };
type Organization = {
  name: string;
  kind: string;
  region: string;
  services: string;
  website: string;
};
type Project = {
  id: string;
  name: string;
  kind: string;
  region: string;
  summary: string;
  status: string;
  visibility: string;
};
type Member = {
  id: string;
  name: string;
  role: string;
  status: string;
  isYou?: boolean;
};
type PoolConsent = ReviewRecord & {
  holder: string;
  reference: string;
  authority: string;
  scope: string;
  reviewNote?: string;
};
type Parcel = Omit<MonitoringParcel, 'boundaries'> &
  ReviewRecord & {
    projectId: string;
    areaSquareMetres: number;
    landReference: string;
    consentReference: string;
    notes: string;
    consents?: PoolConsent[];
    boundaries?: (MonitoringBoundary & { areaSquareMetres?: number })[];
  };
type Evidence = ReviewRecord & {
  projectId: string;
  title: string;
  method: string;
  period: string;
  notes: string;
  reference: string;
  reviewNote?: string;
  asset?: { id: string; filename: string; sha256: string };
};
type Agreement = ReviewRecord & {
  projectId: string;
  kind: string;
  holder: string;
  jurisdiction: string;
  notes: string;
  parcelIds?: string[];
  reference: string;
  reviewNote?: string;
  executionReference?: string;
  recordingReference?: string;
};
type Amounts = {
  grossCents: number;
  stewardshipCents: number;
  treasuryCents: number;
  memberPoolCents: number;
  members: { id: string; name: string; cents: number }[];
};
type Workspace = Omit<CommunityState, 'projects' | 'members' | 'tasks'> &
  Omit<MonitoringState, 'parcels'> & {
    name: string;
    region: string;
    summary: string;
    financialRecordsRedactedAt?: number;
    country: string;
    currency: string;
    projects: Project[];
    members: Member[];
    parcels: Parcel[];
    evidence: Evidence[];
    organization: Organization | null;
    partnerships?: (ReviewRecord &
      ParticipationPartner & {
        name: string;
        role: string;
        agreementReference: string;
        website: string;
      })[];
    assessments?: (ReviewRecord & {
      program: string;
      methodology: string;
      areaSquareMetres: number;
      minimumSquareMetres: number;
      parcelIds: string[];
      source: string;
      criteria: string;
      gaps: string;
    })[];
    tasks: (ReviewRecord & {
      projectId: string;
      title: string;
      due?: string;
    })[];
    invitations?: {
      id: string;
      label: string;
      revoked: boolean;
      used: boolean;
      expiresAt: number;
    }[];
    blocks?: { memberId: string; name: string }[];
    agreements: Agreement[];
    proposals: (ReviewRecord & {
      title: string;
      text: string;
      electorate: string[];
      closesAt: number;
      quorum: number;
      stewardshipBps: number;
      treasuryBps: number;
      shares: { id: string; name: string; shareBps: number }[];
      votes: { memberId: string; choice: string }[];
    })[];
    charters: {
      id: string;
      version: number;
      adoptedAt: number;
      title: string;
    }[];
    audit: {
      id: string;
      sequence: number;
      action: string;
      actor: string;
      at: number;
      hash: string;
    }[];
    authority:
      | (ReviewRecord & {
          legalName: string;
          jurisdiction: string;
          reference: string;
        })
      | null;
    lots: (ReviewRecord & {
      evidenceId?: string;
      projectId: string;
      registry: string;
      program: string;
      method: string;
      vintage: string;
      units: number;
      serialPrefix: string;
      serialStart: number;
      serialEnd: number;
      reference: string;
    })[];
    settlements: (ReviewRecord & {
      evidenceId?: string;
      lotId: string;
      cents: number;
      units: number;
      reference: string;
    })[];
    allocations: (ReviewRecord & {
      settlementId: string;
      amounts: Amounts;
      payments: (ReviewRecord & {
        evidenceId?: string;
        memberId: string;
        cents: number;
        reference: string;
      })[];
      disbursements?: (ReviewRecord & {
        evidenceId?: string;
        budget: 'stewardship' | 'treasury';
        cents: number;
        recipientLabel: string;
        purpose: string;
        reference: string;
      })[];
    })[];
    retirements: (ReviewRecord & {
      evidenceId?: string;
      units: number;
      beneficiary: string;
      reference: string;
    })[];
  };
type PublicCoop = {
  id: string;
  name: string;
  region: string;
  summary: string;
  country?: string;
  organization?: Organization;
  projects: Project[];
  updates: CommunityState['updates'];
  events?: CommunityEvent[];
  memberCount: number;
};
type WorkspaceSummary = {
  id: string;
  name: string;
  region: string;
  visibility: string;
};
type WorkspaceResponse = {
  id: string;
  error: string;
  state?: Workspace;
  capacity?: WorkspaceCapacityStatus;
  coop?: PublicCoop;
  role?: string;
  memberId?: string;
  isOwner?: boolean;
  version: number;
  membershipStatus?: string;
  name?: string;
};
type FormValues = Record<string, string | number | string[]>;
type CommandPayload = Record<string, unknown>;
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverClock = () => 0;
type Field = {
  name: string;
  label: string;
  type?: 'textarea' | 'number' | 'date' | 'select' | 'multiselect';
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
  onSubmit: (value: FormValues) => Promise<boolean>;
  disabled?: boolean;
}) {
  const formId = useId();
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
        const formData = new FormData(form);
        const raw = Object.fromEntries(
          [...formData.entries()].filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
        const data: FormValues = { ...raw };
        for (const field of fields)
          if (field.type === 'number')
            data[field.name] = Number(raw[field.name]);
          else if (field.type === 'multiselect')
            data[field.name] = formData
              .getAll(field.name)
              .filter((value): value is string => typeof value === 'string');
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
        {fields.map((f) =>
          f.type === 'multiselect' ? (
            <fieldset key={f.name}>
              <legend>{f.label}</legend>
              {f.options?.map((o) => (
                <label className="block py-1" key={o.value}>
                  <input type="checkbox" name={f.name} value={o.value} />{' '}
                  {o.label}
                </label>
              ))}
            </fieldset>
          ) : (
            <label key={f.name} htmlFor={`${formId}-${f.name}`}>
              <span>
                {f.label}
                {f.optional ? ' (optional)' : ''}
              </span>
              {f.type === 'textarea' ? (
                <Textarea
                  id={`${formId}-${f.name}`}
                  name={f.name}
                  required={!f.optional}
                  maxLength={f.max ?? 2000}
                  defaultValue={f.value}
                />
              ) : f.type === 'select' ? (
                <NativeSelect
                  id={`${formId}-${f.name}`}
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
                  id={`${formId}-${f.name}`}
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
          ),
        )}
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
const options = (items: NamedRecord[], key: keyof NamedRecord = 'name') =>
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
  items: NamedRecord[],
  key: keyof NamedRecord = 'name',
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
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  const pendingRequests = useRef(new Map<string, string>());
  const mutationInFlight = useRef(false);
  const loadGeneration = useRef(0);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [nextId, setNextId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshIssue, setRefreshIssue] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(0);
  const [coops, setCoops] = useState<PublicCoop[]>([]),
    [mine, setMine] = useState<WorkspaceSummary[]>([]),
    [selected, setSelected] = useState(''),
    [data, setData] = useState<WorkspaceResponse | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [workspaceTab, setWorkspaceTab] = useState('community'),
    [invitationLink, setInvitationLink] = useState(''),
    [next, setNext] = useState<number | null>(null);
  const load = useCallback(
    async (
      id = '',
      query = '',
      preserveWorkspace = false,
      conflictRefresh = false,
      background = false,
    ) => {
      if (preserveWorkspace && mutationInFlight.current && !conflictRefresh)
        return;
      const generation = ++loadGeneration.current;
      if (!preserveWorkspace) setLoading(true);
      if (!background) setError('');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const url =
          mode === 'network'
            ? `/api/network${id ? `?id=${encodeURIComponent(id)}` : `?q=${encodeURIComponent(query)}`}`
            : `/api/workspaces${id ? `?id=${encodeURIComponent(id)}` : ''}`;
        const r = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (generation !== loadGeneration.current) return;
        // Clear retained private data even if an access-denied response is not JSON.
        if ([401, 403, 404].includes(r.status)) setData(null);
        const value: WorkspaceResponse & {
          coops: PublicCoop[];
          next: number | null;
          nextId: string | null;
          workspaces: WorkspaceSummary[];
        } = await r.json();
        if (generation !== loadGeneration.current) return;
        if (!r.ok) {
          // Membership revocation must also remove retained private forms.
          throw new Error(value.error || 'Unable to load the workspace.');
        }
        setRefreshIssue(false);
        setLastRefreshedAt(Date.now());
        if (background) setError('');
        if (id) setData(value);
        else {
          setData(null);
          if (mode === 'network') {
            setCoops(value.coops);
            setNext(value.next);
            setNextId(value.nextId);
            setAppliedSearch(query);
            setSearch(query);
          } else setMine(value.workspaces);
        }
      } catch (e) {
        if (generation === loadGeneration.current) {
          setRefreshIssue(true);
          if (!background) setError((e as Error).message);
        }
      } finally {
        window.clearTimeout(timeout);
        if (generation === loadGeneration.current && !preserveWorkspace)
          setLoading(false);
      }
    },
    [mode],
  );
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('coop') ?? '';
    queueMicrotask(() => {
      setSelected(id);
      void load(id);
    });
  }, [load]);
  const hasWorkspace = Boolean(data?.state);
  useEffect(() => {
    if (mode !== 'workspace' || !signedIn || !selected || !hasWorkspace) return;
    return startWorkspaceRefresh({
      refresh: () => load(selected, '', true, false, true),
      document,
      window,
    });
  }, [mode, signedIn, selected, hasWorkspace, load]);
  const chooseCoop = (id: string, afterSave = false) => {
    if (mutationInFlight.current && !afterSave) return;
    setInvitationLink('');
    setData(null);
    setNotice('');
    setRefreshIssue(false);
    setLastRefreshedAt(0);
    setWorkspaceTab('community');
    setSelected(id);
    history.replaceState(
      null,
      '',
      `${location.pathname}${id ? `?coop=${encodeURIComponent(id)}` : ''}`,
    );
    void load(id);
  };
  async function mutate(op: string, payload: CommandPayload): Promise<boolean> {
    if (mutationInFlight.current)
      throw new Error('Wait for the current save to finish.');
    // Invalidate an earlier background GET before saving against this version.
    const generation = ++loadGeneration.current;
    mutationInFlight.current = true;
    setBusy(true);
    setNotice('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const requestKey = JSON.stringify({ selected, op, payload });
      const requestId =
        pendingRequests.current.get(requestKey) ?? crypto.randomUUID();
      pendingRequests.current.set(requestKey, requestId);
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: selected,
          version: data?.version,
          op,
          payload,
          requestId,
        }),
      });
      if (generation !== loadGeneration.current) return false;
      if (r.status === 401) setData(null);
      const result: WorkspaceResponse = await r.json();
      // A late response must not replace records loaded for another workspace.
      if (generation !== loadGeneration.current) return false;
      if (!r.ok) {
        // A denied action can mean a self-review or stale item, not lost membership.
        // Confirm actual read access before unmounting retained private drafts.
        if ([403, 404, 409].includes(r.status))
          await load(selected, '', true, true);
        throw new Error(result.error);
      }
      pendingRequests.current.delete(requestKey);
      if (op === 'create') {
        chooseCoop(result.id, true);
      } else if (op === 'request_membership') {
        setNotice('Request saved. A steward will review your membership.');
      } else if (op === 'leave') {
        chooseCoop('', true);
      } else {
        setData(result);
        setNotice('Saved to the shared co-op record.');
      }
      return true;
    } catch (e) {
      if (controller.signal.aborted)
        throw new Error(
          'The save response timed out. Its outcome is unknown. Retry the same unchanged form to check the original request without creating a duplicate.',
        );
      throw e;
    } finally {
      window.clearTimeout(timeout);
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  async function quick(op: string, payload: CommandPayload) {
    try {
      await mutate(op, payload);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function more() {
    if (next === null || loadingMore) return;
    const generation = loadGeneration.current;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({
        before: String(next),
        q: appliedSearch,
      });
      if (nextId) query.set('beforeId', nextId);
      const r = await fetch(`/api/network?${query}`);
      const v: {
        error: string;
        coops: PublicCoop[];
        next: number | null;
        nextId: string | null;
      } = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (generation !== loadGeneration.current) return;
      setCoops((c) => [
        ...c,
        ...v.coops.filter(
          (item) => !c.some((existing) => existing.id === item.id),
        ),
      ]);
      setNext(v.next);
      setNextId(v.nextId);
    } catch (e) {
      if (generation === loadGeneration.current) setError((e as Error).message);
    } finally {
      setLoadingMore(false);
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
  const exportRecords = () => {
    if (!state) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
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
      state?.evidence.filter((e) => e.status === 'reviewed') ?? [],
      'title',
    );
  // The same forms serve workspace tabs and private actions in the conversation.
  // Keep this a render helper: defining a component here would reset drafts on saves.
  function renderWorkspacePanel(panel: string) {
    if (!state || !data) return null;
    switch (panel) {
      case 'organizations':
        return (
          <>
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
                <PartnerParticipation
                  records={state.partnerships ?? []}
                  steward={steward}
                  members={state.members}
                  projects={state.projects}
                  disabled={busy}
                  growthPaused={
                    state.visibility === 'archived' ||
                    data.capacity?.growthPaused
                  }
                  mutate={mutate}
                />
                {steward &&
                  (state.partnerships ?? []).map((partner) => (
                    <article className="network-card" key={partner.id}>
                      <h3>{partner.name}</h3>
                      <Status value={partner.status} />
                      <p>{partner.role}</p>
                      <p>Agreement reference: {partner.agreementReference}</p>
                      <a
                        href={partner.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Partner website ↗
                      </a>
                      <p className="small">
                        Private co-op record. A steward review does not
                        independently verify the nonprofit or its authority.
                      </p>
                      {partner.status === 'submitted' && (
                        <ActionForm
                          fields={[
                            choices('decision', 'Partner review decision', [
                              'approve',
                              'reject',
                            ]),
                          ]}
                          submit="Review partner agreement"
                          onSubmit={(v) =>
                            mutate('review_partnership', {
                              ...v,
                              id: partner.id,
                            })
                          }
                        />
                      )}
                      {partner.status === 'reviewed' && (
                        <ActionForm
                          fields={[
                            field(
                              'reason',
                              'Reason for ending this partnership record',
                              'textarea',
                              { max: 1000 },
                            ),
                          ]}
                          submit="Revoke partner record"
                          onSubmit={(v) =>
                            mutate('revoke_partnership', {
                              ...v,
                              id: partner.id,
                            })
                          }
                        />
                      )}
                    </article>
                  ))}
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
                      field('website', 'Official website (HTTPS)', undefined, {
                        value: state.organization?.website,
                        max: 500,
                      }),
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
                {steward && (
                  <p className="small mt-4">
                    First submit the partner’s agreement in Evidence and have
                    another steward review it. Then link that evidence to the
                    same project here.
                  </p>
                )}
                {steward && (
                  <ActionForm
                    title="Record an agreed conservation partnership"
                    fields={[
                      projectField(),
                      field('name', 'Partner organization name', undefined, {
                        max: 160,
                      }),
                      field(
                        'website',
                        'Partner official website (HTTPS)',
                        undefined,
                        { max: 500 },
                      ),
                      field(
                        'role',
                        'Agreed role and responsibilities',
                        'textarea',
                        { max: 1000 },
                      ),
                      field(
                        'agreementReference',
                        'Private reference to the partner’s agreement',
                        undefined,
                        { max: 500 },
                      ),
                      select(
                        'evidenceId',
                        'Reviewed evidence of the partner’s agreement',
                        state.evidence.filter((e) => e.status === 'reviewed'),
                        'title',
                      ),
                    ]}
                    submit="Submit partner agreement for review"
                    onSubmit={(v) => mutate('record_partnership', v)}
                  />
                )}
                <p className="small mt-4">
                  Profiles are self-reported. Public profiles appear only when
                  the co-op itself is public. No affiliation is independently
                  verified by Verge Common.
                </p>
              </aside>
            </div>
          </>
        );
      case 'monitoring':
        return (
          <>
            <MonitoringBoard
              key={selected}
              state={state}
              steward={steward}
              busy={busy}
              growthPaused={data.capacity?.growthPaused}
              mutate={mutate}
              refresh={() => load(selected, '', true)}
            />
          </>
        );
      case 'pooling':
        return (
          <>
            <h2>Bring compatible parcels into one pathway</h2>
            <p>
              Reviewed parcels can be assessed together for a selected program
              and methodology. An area total is a planning measure, not a
              carbon-credit approval.
            </p>
            {steward && (
              <CooperativeParcelMap
                key={selected}
                parcels={state.parcels}
                projects={state.projects}
                steward={steward}
              />
            )}
            {steward ? (
              <div className="network-columns">
                <section>
                  {state.projects.map((p) => {
                    const parcels = state.parcels.filter(
                      (x) => x.projectId === p.id && x.status === 'reviewed',
                    );
                    const readiness = projectReadiness(state, p.id);
                    return (
                      <article className="network-card" key={p.id}>
                        <h3>{p.name}</h3>
                        <h4>Preparation for external review</h4>
                        <ul>
                          {readiness.checks.map((check) => (
                            <li key={check.id}>
                              {check.complete ? 'Recorded' : 'Needed'}:{' '}
                              {check.label}
                            </li>
                          ))}
                        </ul>
                        <p className="small">
                          This checklist tracks preparation records. It does not
                          approve carbon credits or payouts.
                        </p>
                        <p>
                          {parcels.length} reviewed parcels ·{' '}
                          {(
                            readiness.geometry.areaSquareMetres / 10000
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          })}{' '}
                          hectares estimated from reviewed boundaries
                        </p>
                        {readiness.geometry.problems.map((problem, i) => (
                          <p
                            className="notice"
                            key={`${problem.parcelId}-${i}`}
                          >
                            {
                              state.parcels.find(
                                (parcel) => parcel.id === problem.parcelId,
                              )?.name
                            }
                            : {label(problem.reason)}. Review the parcel and
                            boundary in the parcels and monitoring tabs.
                          </p>
                        ))}
                        {readiness.geometry.overlaps.map((overlap) => (
                          <p
                            className="notice"
                            key={overlap.parcelIds.join(':')}
                          >
                            Overlap:{' '}
                            {overlap.parcelIds
                              .map(
                                (id) =>
                                  state.parcels.find(
                                    (parcel) => parcel.id === id,
                                  )?.name,
                              )
                              .join(' / ')}{' '}
                            —{' '}
                            {overlap.areaSquareMetres.toLocaleString(
                              undefined,
                              { maximumFractionDigits: 1 },
                            )}{' '}
                            m². Correct the boundaries or withdraw the duplicate
                            parcel before pooling.
                          </p>
                        ))}
                        <p className="small">
                          Areas use the drawn boundary and a spherical Earth
                          model. Recorded and drawn areas must agree within 5%
                          or 1 m², whichever is larger. This is a planning
                          check, not a survey. Overlaps are checked within this
                          co-op; qualified reviewers must check other projects
                          and registry claims separately.
                        </p>
                      </article>
                    );
                  })}
                  {(state.assessments ?? []).map((a) => (
                    <article className="network-card" key={a.id}>
                      <h3>
                        {a.program} · {a.methodology}
                      </h3>
                      <Status value={a.status} />
                      {!assessmentIsCurrent(state, a) && (
                        <p className="notice">
                          Land records changed, or this older assessment lacks a
                          versioned snapshot. Record and review a new
                          assessment.
                        </p>
                      )}
                      <p>
                        Boundary snapshot:{' '}
                        {a.areaSquareMetres.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}{' '}
                        m² across {a.parcelIds.length} reviewed parcels.
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
                    This saves the current reviewed-parcel snapshot. Create a
                    new assessment when land or methodology changes. Another
                    steward reviews your record; that review does not certify
                    eligibility or issue credits.
                  </p>
                </aside>
              </div>
            ) : (
              <Empty>
                Stewards manage pooling assessments because they contain private
                land records. Ask a steward to discuss the pathway with you.
              </Empty>
            )}
          </>
        );
      case 'projects':
        return (
          <>
            <div className="network-columns">
              <section>
                {state.projects.length === 0 && (
                  <Empty>
                    Add your first EcoHedge or conservation project.
                  </Empty>
                )}
                {state.projects.map((p) => (
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
                        .filter((t) => t.projectId === p.id)
                        .map((t) => (
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
                {state.updates
                  .filter((u) => !u.blocked)
                  .map((u) => (
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
                      field('summary', 'Purpose and next steps', 'textarea'),
                    ]}
                    submit="Create private project"
                    onSubmit={(p) => mutate('create_project', p)}
                    disabled={busy}
                  />
                  <p className="small mt-4">
                    Keep exact parcel locations private. A steward can publish
                    the general project description.
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
          </>
        );
      case 'parcels':
        return (
          <>
            <div className="network-columns">
              <section>
                {state.parcels.length === 0 && (
                  <Empty>
                    Record land rights and consent before bringing a parcel into
                    a carbon pool.
                  </Empty>
                )}
                {state.parcels.map((p) => (
                  <article className="network-card" key={p.id}>
                    <h3>{p.name}</h3>
                    <p>
                      {(p.areaSquareMetres / 10000).toLocaleString()} hectares
                    </p>
                    <p className="small">
                      Private land reference: {p.landReference}
                      <br />
                      Consent reference: {p.consentReference}
                    </p>
                    <p>{p.notes}</p>
                    <Status value={p.status} />
                    <p className="small">
                      {parcelConsentIsCurrent(p)
                        ? 'Current pooling consent reviewed'
                        : 'Current pooling consent needed'}
                    </p>
                    {p.status !== 'withdrawn' &&
                      p.boundaries?.at(-1)?.status === 'reviewed' && (
                        <>
                          <p className="small">
                            Boundary estimate:{' '}
                            {Number.isFinite(
                              Number(p.boundaries.at(-1)?.areaSquareMetres),
                            )
                              ? `${Math.round(Number(p.boundaries.at(-1)?.areaSquareMetres)).toLocaleString()} m²`
                              : 'shown in the pooling geometry check'}
                            . A correction requires another parcel review and
                            new consent.
                          </p>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              quick('use_boundary_area', { parcelId: p.id })
                            }
                          >
                            Use boundary estimate as recorded area
                          </Button>
                        </>
                      )}
                    {(p.consents ?? []).map((consent) => (
                      <section className="mt-4" key={consent.id}>
                        <h4>Pooling consent: {consent.holder}</h4>
                        <Status value={consent.status} />
                        <p className="small">
                          Reference: {consent.reference}
                          <br />
                          Authority: {consent.authority}
                          <br />
                          Scope: {consent.scope}
                        </p>
                        {consent.reviewNote && (
                          <p className="small">Review: {consent.reviewNote}</p>
                        )}
                        {steward &&
                          consent.status === 'submitted' &&
                          consent.id === p.consents?.at(-1)?.id && (
                            <ActionForm
                              fields={[
                                choices('decision', 'Consent review decision', [
                                  'approve',
                                  'reject',
                                ]),
                                field(
                                  'note',
                                  'Consent review notes',
                                  'textarea',
                                ),
                              ]}
                              submit="Review pooling consent"
                              disabled={busy}
                              onSubmit={(v) =>
                                mutate('review_parcel_consent', {
                                  ...v,
                                  parcelId: p.id,
                                  id: consent.id,
                                })
                              }
                            />
                          )}
                        {['submitted', 'reviewed'].includes(consent.status) && (
                          <ActionForm
                            fields={[
                              field(
                                'reason',
                                'Reason for withdrawing this consent record',
                                'textarea',
                                { max: 1000 },
                              ),
                            ]}
                            submit="Revoke pooling consent record"
                            disabled={busy}
                            onSubmit={(v) =>
                              mutate('revoke_parcel_consent', {
                                ...v,
                                parcelId: p.id,
                                id: consent.id,
                              })
                            }
                          />
                        )}
                      </section>
                    ))}
                    {p.status === 'reviewed' &&
                      p.boundaries?.at(-1)?.status === 'reviewed' && (
                        <ActionForm
                          title="Record consent for this parcel and boundary"
                          fields={[
                            field(
                              'holder',
                              'Consenting rights holder',
                              undefined,
                              { max: 200 },
                            ),
                            field(
                              'authority',
                              'Authority of the person providing consent',
                              'textarea',
                              { max: 1000 },
                            ),
                            field(
                              'reference',
                              'Signed consent document reference',
                              undefined,
                              { max: 300 },
                            ),
                            field(
                              'scope',
                              'Agreed pooling purpose, duration, and restrictions',
                              'textarea',
                              { max: 2000 },
                            ),
                            {
                              ...choices(
                                'attested',
                                'The referenced holder consent covers this parcel and its current boundary',
                                ['confirmed'],
                              ),
                              value: '',
                            },
                          ]}
                          submit="Submit pooling consent for review"
                          disabled={busy}
                          onSubmit={(v) =>
                            mutate('record_parcel_consent', {
                              ...v,
                              parcelId: p.id,
                              attested: v.attested === 'confirmed',
                            })
                          }
                        />
                      )}
                    {p.status !== 'withdrawn' && (
                      <ActionForm
                        fields={[
                          field(
                            'reason',
                            'Reason for withdrawing this parcel from the proposed pool',
                            'textarea',
                            { max: 1000 },
                          ),
                        ]}
                        submit="Withdraw parcel from pool"
                        disabled={busy}
                        onSubmit={(v) =>
                          mutate('withdraw_parcel', {
                            ...v,
                            parcelId: p.id,
                          })
                        }
                      />
                    )}
                    <p className="small">
                      Consent and withdrawal records do not create or terminate
                      a legal agreement. Have the rights holder and qualified
                      advisers confirm those actions separately.
                    </p>
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
                      areaSquareMetres: areaToSquareMetres(
                        Number(p.area),
                        String(p.unit),
                      ),
                    })
                  }
                  disabled={busy || !state.projects.length}
                />
                <p className="small mt-5">
                  Only you and co-op stewards can view this record. It does not
                  map, convey, or verify land ownership automatically.
                </p>
              </aside>
            </div>
          </>
        );
      case 'members':
        return (
          <>
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
                    const result: { error: string; link: string } =
                      await response.json();
                    if (!response.ok) throw new Error(result.error);
                    setInvitationLink(location.origin + result.link);
                    await load(selected, '', true);
                    return true;
                  }}
                />
                <p className="small">
                  Expires after seven days. Whoever receives the link can submit
                  one request; a steward must still approve membership. Share it
                  privately. Site access restrictions still apply.
                </p>
                {invitationLink && (
                  <ControlLabel>
                    Copy this invitation before leaving
                    <Input
                      readOnly
                      value={invitationLink}
                      onFocus={(e) => e.target.select()}
                    />
                  </ControlLabel>
                )}
                {(state.invitations ?? []).map((i) => (
                  <div className="network-meta" key={i.id}>
                    <span>
                      {i.label} ·{' '}
                      {i.revoked
                        ? 'Revoked'
                        : i.used
                          ? 'Request received'
                          : i.expiresAt <= now
                            ? 'Expired'
                            : `Expires ${date(i.expiresAt)}`}
                    </span>
                    {!i.used && !i.revoked && (
                      <Button
                        variant="outline"
                        onClick={() => quick('revoke_invitation', { id: i.id })}
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
                Invite people by sharing the public co-op link. No invitations
                are sent automatically.
              </p>
              <p className="small">
                Blocking hides your updates, replies and events from each other
                inside this co-op, and prevents replies or event responses
                between you. Public pages and shared governance records remain
                visible. Stewards retain moderation access. Report harmful
                content before blocking so stewards can review it.
              </p>
              {state.members.map((m) => (
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
                    {!m.isYou && m.status === 'active' && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          quick(
                            state.blocks?.some((b) => b.memberId === m.id)
                              ? 'unblock_member'
                              : 'block_member',
                            { id: m.id },
                          )
                        }
                      >
                        {state.blocks?.some((b) => b.memberId === m.id)
                          ? 'Unblock member'
                          : 'Block member'}
                      </Button>
                    )}
                    {steward && m.status === 'pending' && (
                      <>
                        <Button
                          disabled={
                            busy ||
                            state.visibility === 'archived' ||
                            data.capacity?.growthPaused
                          }
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
                        disabled={
                          busy ||
                          (m.role !== 'steward' &&
                            (state.visibility === 'archived' ||
                              data.capacity?.growthPaused))
                        }
                        onClick={() =>
                          quick('member_role', {
                            id: m.id,
                            role: m.role === 'steward' ? 'member' : 'steward',
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
                    {data.isOwner &&
                      !m.isYou &&
                      m.status === 'active' &&
                      m.role === 'steward' && (
                        <ConfirmAction
                          title={`Transfer responsibility to ${m.name}?`}
                          description="Confirm this steward has agreed to take over. They will control steward appointments and co-op archival. You remain a steward but cannot reverse the transfer yourself. Land rights, legal authority and financial records do not change."
                          label="Transfer responsibility"
                          disabled={busy}
                          onConfirm={() =>
                            quick('transfer_stewardship', {
                              id: m.id,
                              confirmation: 'TRANSFER',
                            })
                          }
                        />
                      )}
                  </div>
                </div>
              ))}
              {!!state.blocks?.length && (
                <details className="mt-5">
                  <summary>Members you have blocked</summary>
                  {state.blocks.map((b) => (
                    <div className="network-meta" key={b.memberId}>
                      <span>{b.name}</span>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          quick('unblock_member', { id: b.memberId })
                        }
                      >
                        Unblock member
                      </Button>
                    </div>
                  ))}
                </details>
              )}
              <p className="notice mt-5">
                Evidence and financial records need a different steward to
                review them. Appoint a trusted second steward before progressing
                those records.
              </p>
            </section>
          </>
        );
      case 'agreements':
        return (
          <>
            <div className="network-columns">
              <section>
                {state.agreements.length === 0 && (
                  <Empty>
                    Your authorized agreement records will appear here.
                  </Empty>
                )}
                {state.agreements.map((a) => (
                  <article className="network-card" key={a.id}>
                    <p className="eyebrow">{label(a.kind)}</p>
                    <h3>
                      {state.projects.find((p) => p.id === a.projectId)?.name}
                    </h3>
                    <p>
                      {a.holder} · {a.jurisdiction}
                    </p>
                    <p>{a.notes}</p>
                    <Status value={a.status} />
                    <p className="small">
                      Covered parcels:{' '}
                      {(a.parcelIds ?? [])
                        .map(
                          (id: string) =>
                            state.parcels.find((p) => p.id === id)?.name ??
                            'Private parcel',
                        )
                        .join(', ') ||
                        'Not recorded — submit a scoped replacement'}
                    </p>
                    {!agreementIsCurrent(state, a) && (
                      <p className="notice">
                        Coverage or consent is missing or out of date. A new
                        agreement record must reference the current parcels
                        before this record can count toward readiness.
                      </p>
                    )}
                    {a.status === 'execution_recorded' && steward && (
                      <ActionForm
                        fields={[
                          field(
                            'reason',
                            'Reason this agreement no longer supports the pool',
                            'textarea',
                            { max: 1000 },
                          ),
                        ]}
                        submit="Revoke agreement record"
                        disabled={busy}
                        onSubmit={(v) =>
                          mutate('revoke_agreement', { ...v, id: a.id })
                        }
                      />
                    )}
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
                    {steward &&
                      !['execution_recorded', 'revoked'].includes(a.status) && (
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
                              {
                                optional: a.status !== 'reviewed',
                                max: 300,
                              },
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
                    {
                      name: 'parcelIds',
                      label:
                        'Specific covered parcels (choose only parcels in the selected project)',
                      type: 'multiselect',
                      options: state.parcels
                        .filter((p) => p.status !== 'withdrawn')
                        .map((p) => ({
                          value: p.id,
                          label: `${state.projects.find((project) => project.id === p.projectId)?.name}: ${p.name}`,
                        })),
                    },
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
                  Records are visible to the submitter and stewards. Recording
                  an execution reference does not execute or legally validate an
                  instrument.
                </p>
                <a
                  href="https://github.com/jdhart81/verge-common/tree/main/templates"
                  className="text-link"
                >
                  Open agreement templates ↗
                </a>
              </aside>
            </div>
          </>
        );
      case 'evidence':
        return (
          <>
            <div className="network-columns">
              <section>
                {state.evidence.length === 0 && (
                  <Empty>No evidence visible to you yet.</Empty>
                )}
                {state.evidence.map((e) => (
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
                          <Link
                            href={`/api/files?id=${e.asset.id}`}
                            className="text-link"
                            prefetch={false}
                            target="_top"
                          >
                            <Download size={16} />
                            {e.asset.filename}
                          </Link>
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
                  key={selected}
                  workspaceId={selected}
                  projects={state.projects}
                  disabled={busy}
                  onSubmit={(p) => mutate('submit_evidence', p)}
                />
                <p className="small mt-5">
                  Files are private to the uploader and stewards. Review records
                  document a human review; they do not constitute carbon-program
                  verification.
                </p>
              </aside>
            </div>
          </>
        );
      case 'governance':
        return (
          <>
            <PayoutPreview
              currency={state.currency ?? 'USD'}
              members={state.members.filter((m) => m.status === 'active')}
            />
            <div className="network-columns">
              <section>
                {state.proposals.length === 0 && (
                  <Empty>
                    Adopt a versioned allocation policy with a recorded member
                    vote.
                  </Empty>
                )}
                {state.proposals.map((p) => (
                  <article className="network-card" key={p.id}>
                    <h3>{p.title}</h3>
                    <p>{p.text}</p>
                    <Status value={p.status} />
                    <p className="small">
                      {p.votes.length} of {p.electorate.length} votes · closes{' '}
                      {new Date(p.closesAt).toLocaleString()} · quorum{' '}
                      {p.quorum}
                    </p>
                    <dl className="ledger">
                      {p.shares.map((m) => (
                        <div key={m.id}>
                          <dt>{m.name}</dt>
                          <dd>{m.shareBps / 100}%</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="small mt-3">
                      Stewardship {p.stewardshipBps / 100}% · treasury{' '}
                      {p.treasuryBps / 100}% of settled proceeds. Member shares
                      apply to the remainder.
                    </p>
                    {p.status === 'open' && (
                      <>
                        {now > 0 &&
                        now < p.closesAt &&
                        p.electorate.includes(data.memberId ?? '') ? (
                          <div className="button-row mt-4">
                            {['approve', 'oppose', 'abstain'].map((choice) => (
                              <Button
                                variant={
                                  p.votes.find(
                                    (v) => v.memberId === data.memberId,
                                  )?.choice === choice
                                    ? 'default'
                                    : 'outline'
                                }
                                key={choice}
                                disabled={
                                  busy ||
                                  state.visibility === 'archived' ||
                                  data.capacity?.growthPaused
                                }
                                onClick={() =>
                                  quick('vote', { id: p.id, choice })
                                }
                              >
                                {label(choice)}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="small mt-4">
                            {now === 0
                              ? 'Checking the voting deadline…'
                              : now >= p.closesAt
                                ? 'The voting deadline has passed. A steward can tally the result.'
                                : 'This proposal is open to the members named when voting began.'}
                          </p>
                        )}
                        {steward && (
                          <Button
                            variant="outline"
                            className="mt-4"
                            disabled={
                              busy ||
                              state.visibility === 'archived' ||
                              data.capacity?.growthPaused ||
                              now === 0 ||
                              (now < p.closesAt &&
                                p.votes.length < p.electorate.length)
                            }
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
                        .filter((m) => m.status === 'active')
                        .map((m) =>
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
                          Number(p.stewardshipPercent) * 100,
                        ),
                        treasuryBps: Math.round(
                          Number(p.treasuryPercent) * 100,
                        ),
                        shares: state.members
                          .filter((m) => m.status === 'active')
                          .map((m) => ({
                            id: m.id,
                            shareBps: Math.round(
                              Number(p[`share_${m.id}`]) * 100,
                            ),
                          })),
                      })
                    }
                    disabled={busy}
                  />
                ) : (
                  <p>Stewards propose policy; eligible members vote here.</p>
                )}
                <p className="small mt-5">
                  The electorate is frozen when a proposal opens. Adoption
                  requires two-thirds participation and approval by more than
                  half of that electorate. Voting closes at the deadline, or
                  early once everyone has voted.
                </p>
                <p className="notice mt-4">
                  An adopted software policy does not establish a legal co-op or
                  replace its legally required governance.
                </p>
              </aside>
            </div>
          </>
        );
      case 'ledger':
        return (
          <>
            <Ledger
              state={state}
              steward={steward}
              growthPaused={data?.capacity?.growthPaused}
              busy={busy}
              mutate={mutate}
              quick={quick}
            />
          </>
        );
      case 'authority':
        if (!steward) return null;
        return (
          <div className="mt-8">
            <h2>Legal authority record</h2>
            {state.authority ? (
              <>
                <p>
                  {state.authority.legalName} · {state.authority.jurisdiction}
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
                        onClick={() => quick('review_authority', { decision })}
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
                No external legal authority has been recorded. Issued holding
                records stay blocked.
              </p>
            )}
            {steward && state.authority?.status !== 'reviewed' && (
              <ActionForm
                fields={[
                  field('legalName', 'Legal co-op / project-holder name'),
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
              This records human review of external documents. It does not form
              a legal entity.
            </p>
          </div>
        );
      default:
        return null;
    }
  }
  const visibleCoops = coops;
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <Link className="brand" href="/" prefetch={false} target="_top">
          <BrandLogo />
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/app/" prefetch={false} target="_top">
            Get the app
          </Link>
          <Link href="/network/" prefetch={false} target="_top">
            Discover
          </Link>
          <Link href="/workspace/" target="_top" prefetch={false}>
            My co-ops
          </Link>
          {signedIn ? (
            <Link href="/account" target="_top" prefetch={false}>
              Account
            </Link>
          ) : (
            <Link
              href="/signin-with-chatgpt?return_to=/workspace/"
              target="_top"
              prefetch={false}
            >
              Sign in
            </Link>
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
              disabled={busy}
            >
              <ArrowLeft />
              All co-ops
            </Button>
          ) : mode === 'network' ? (
            <Link
              className="button primary"
              href="/workspace/"
              target="_top"
              prefetch={false}
            >
              <Plus />
              Start a co-op
            </Link>
          ) : (
            <Link
              className="text-link"
              href="/network/"
              prefetch={false}
              target="_top"
            >
              Explore the network <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
        {selected && (
          <p className="small mb-4">
            <Link
              href={`/report/?kind=coop&coop=${encodeURIComponent(selected)}`}
            >
              Report a concern to the operator
            </Link>
          </p>
        )}
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
              onClick={() => load(selected, '', true)}
            >
              Retry
            </Button>
          </div>
        )}
        {notice && <output className="notice mt-5">{notice}</output>}
        {refreshIssue && (
          <output className="notice">
            We could not refresh the workspace. Displayed records may be out of
            date. Reconnect and use Refresh to check access and recent changes.
          </output>
        )}
        {loading ? (
          <output className="empty">Loading co-op records…</output>
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
                    <PublicEvents events={data.coop.events ?? []} />
                    <h2>Conservation projects</h2>
                    {data.coop.projects.length === 0 ? (
                      <Empty>No projects have been made public yet.</Empty>
                    ) : (
                      data.coop.projects.map((p) => (
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
                      data.coop.updates.map((u) => (
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
                    <Link
                      className="text-link"
                      href={`/workspace/?coop=${selected}`}
                      prefetch={false}
                      target="_top"
                    >
                      Already a member? Open workspace ↗
                    </Link>
                  </aside>
                </div>
              </>
            ) : (
              <>
                <OrganizationDiscovery coops={coops} />
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void load('', search.trim());
                  }}
                >
                  <ControlLabel className="search-label">
                    Search the public co-op directory
                    <Input
                      placeholder="Search by name or general region…"
                      value={search}
                      maxLength={160}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </ControlLabel>
                  <Button type="submit" className="mb-4">
                    Search
                  </Button>
                </form>
                <div className="network-grid">
                  {visibleCoops.map((c) => (
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
                {appliedSearch && visibleCoops.length === 0 && (
                  <Empty>
                    <h2>
                      {next !== null
                        ? 'Keep exploring the directory'
                        : 'No matching co-ops'}
                    </h2>
                    <output className="block mb-4">
                      {next !== null
                        ? `No matches for “${appliedSearch}” in this part of the directory. Load more to continue searching.`
                        : `No public co-ops match “${appliedSearch}” in the current results. Try another name or general region.`}
                    </output>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void load();
                      }}
                    >
                      Clear search
                    </Button>
                  </Empty>
                )}
                {!coops.length && !appliedSearch && (
                  <Empty>
                    <Sprout size={36} className="mx-auto mb-4" />
                    <h2>Be the first to plant a flag.</h2>
                    <p>
                      No co-ops have made their profiles public yet. Start with
                      a real group and a place you care about.
                    </p>
                    <Link
                      href="/workspace/"
                      target="_top"
                      className="button primary mt-4"
                      prefetch={false}
                    >
                      Create your co-op
                    </Link>
                  </Empty>
                )}
                {next !== null && (
                  <Button
                    variant="outline"
                    onClick={more}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more co-ops'}
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
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => load(selected, '', true)}
              >
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
            <p className="small">
              Checks for changes every 30 seconds while this page is visible and
              online. No email or push notifications are sent.
              {lastRefreshedAt > 0 &&
                ` Last checked ${new Date(lastRefreshedAt).toLocaleTimeString()}.`}
            </p>
            {state.visibility === 'archived' && (
              <div className="notice">
                Archived. Existing records and authorized downloads remain
                available. New activity is disabled; authorized reports, blocks,
                removals and consent withdrawals remain available within the
                safety storage limit.
              </div>
            )}
            <WorkspaceCapacityBanner
              capacity={data.capacity}
              coopId={selected}
            />
            <PendingWork
              state={state}
              steward={steward}
              memberId={data.memberId ?? ''}
              now={now}
              onOpenTab={setWorkspaceTab}
            />
            <Tabs
              value={workspaceTab}
              onValueChange={(v) => setWorkspaceTab(String(v))}
              className="mt-6"
            >
              <TabsList className="coop-tabs">
                {[
                  'community',
                  'start',
                  'organizations',
                  'monitoring',
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
              <TabsContent value="community">
                <CommunityBoard
                  state={state}
                  steward={steward}
                  busy={busy}
                  growthPaused={data.capacity?.growthPaused}
                  mutate={mutate}
                  conversationActions={
                    <ConversationJourney
                      key={`${selected}:${data.memberId}:${data.role}`}
                      actions={conversationActions(state, {
                        steward,
                        memberId: data.memberId ?? '',
                        now,
                        growthPaused: data.capacity?.growthPaused,
                      })}
                      renderAction={renderWorkspacePanel}
                      busy={busy}
                    />
                  }
                />
              </TabsContent>
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
                      onboardingProgress(state).circle,
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
                      onboardingProgress(state).assessment,
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
                {renderWorkspacePanel('organizations')}
              </TabsContent>
              <TabsContent value="monitoring">
                {renderWorkspacePanel('monitoring')}
              </TabsContent>
              <TabsContent value="pooling">
                {renderWorkspacePanel('pooling')}
              </TabsContent>
              <TabsContent value="projects">
                {renderWorkspacePanel('projects')}
              </TabsContent>
              <TabsContent value="parcels">
                {renderWorkspacePanel('parcels')}
              </TabsContent>
              <TabsContent value="members">
                {renderWorkspacePanel('members')}
              </TabsContent>
              <TabsContent value="agreements">
                {renderWorkspacePanel('agreements')}
              </TabsContent>
              <TabsContent value="evidence">
                {renderWorkspacePanel('evidence')}
              </TabsContent>
              <TabsContent value="governance">
                {renderWorkspacePanel('governance')}
              </TabsContent>
              <TabsContent value="ledger">
                {renderWorkspacePanel('ledger')}
              </TabsContent>
              <TabsContent value="history">
                <section className="panel mt-5">
                  <h2>Application audit history</h2>
                  <p className="small">
                    Changes are appended with a sequence and linked hashes. This
                    is an application audit trail, not independently notarized
                    proof.
                  </p>
                  {[...state.audit].reverse().map((a) => (
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
                  {renderWorkspacePanel('authority')}
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
                        description="This stops new activity and removes the co-op from discovery. Authorized members can still read and export retained records and make safety changes while storage remains. Archival is permanent in this release and does not erase history or free storage."
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
                  <Link
                    href="/coop/"
                    className="text-link mt-5"
                    prefetch={false}
                    target="_top"
                  >
                    Explore the separate hypothetical accounting workbench ↗
                  </Link>
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
            <Button onClick={() => load(selected, '', true)}>
              Refresh status
            </Button>
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
  projects: Project[];
  disabled: boolean;
  onSubmit: (p: CommandPayload) => Promise<boolean>;
}) {
  type PendingAsset = { id: string; filename: string };
  const [asset, setAsset] = useState<PendingAsset | null>(null),
    [uploading, setUploading] = useState(false),
    [retryFile, setRetryFile] = useState<File | null>(null),
    [discarding, setDiscarding] = useState(false),
    [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const transfer = useRef({
    asset: null as PendingAsset | null,
    cancelled: false,
    attaching: false,
    generation: 0,
  });

  async function discard(id: string) {
    const response = await fetch(`/api/files?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const result = (await response.json()) as PendingAsset & {
        error?: string;
      };
      throw new Error(
        result.error || 'Could not discard the file. Please retry.',
      );
    }
  }

  useEffect(() => {
    const tracker = transfer.current;
    const current = ++tracker.generation;
    return () => {
      if (tracker.generation === current) tracker.generation++;
      const abandoned = tracker.asset;
      if (abandoned && !tracker.attaching) {
        // A failed background cleanup is retried by the 24-hour expiry sweep.
        void discard(abandoned.id).catch(() => {});
      }
    };
  }, []);

  async function removeFile() {
    if (!transfer.current.asset) {
      setRetryFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setMessage('File selection cleared.');
      return;
    }
    setDiscarding(true);
    setMessage('Discarding unsubmitted file…');
    try {
      await discard(transfer.current.asset.id);
      transfer.current.asset = null;
      setAsset(null);
      setRetryFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Unsubmitted file discarded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setDiscarding(false);
    }
  }

  async function upload(file: File) {
    const current = transfer.current.generation;
    transfer.current.cancelled = false;
    setUploading(true);
    setRetryFile(null);
    setMessage('');
    try {
      // Release the previous upload before replacing it, including at quota.
      if (transfer.current.asset) {
        await discard(transfer.current.asset.id);
        transfer.current.asset = null;
        setAsset(null);
      }
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(
        `/api/files?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          body: form,
        },
      );
      const result = (await response.json()) as PendingAsset & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Upload failed. Please retry.');
      if (
        transfer.current.cancelled ||
        transfer.current.generation !== current
      ) {
        // Wait for the server receipt before discarding; aborting the browser
        // request alone cannot cancel a server write already in progress.
        if (transfer.current.generation === current) {
          transfer.current.asset = result;
          setAsset(result);
        }
        await discard(result.id);
        if (transfer.current.generation === current) {
          transfer.current.asset = null;
          setAsset(null);
          if (inputRef.current) inputRef.current.value = '';
          setMessage('Upload cancelled and unsubmitted file discarded.');
        }
        return;
      }
      transfer.current.asset = result;
      setAsset(result);
      setMessage(
        `Uploaded ${result.filename}. Complete the evidence form to attach it.`,
      );
    } catch (error) {
      if (transfer.current.generation === current) {
        if (!transfer.current.cancelled) setRetryFile(file);
        setMessage(
          `${(error as Error).message} Any unattached upload expires after 24 hours.`,
        );
      }
    } finally {
      if (transfer.current.generation === current) setUploading(false);
    }
  }

  return (
    <>
      <h2>Submit evidence</h2>
      <ControlLabel className="upload-label">
        Private file (optional)
        <Input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
          disabled={uploading || discarding || disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clearing the browser chooser is not a replacement or discard.
            if (file) void upload(file);
          }}
        />
      </ControlLabel>
      <output className="small" aria-live="polite">
        {uploading ? message || 'Uploading…' : message}
      </output>
      <p className="small">
        Unsubmitted files expire after 24 hours. Attached evidence is retained.
      </p>
      {uploading ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            transfer.current.cancelled = true;
            setMessage(
              'Cancelling… Waiting for the upload receipt so the file can be discarded.',
            );
          }}
        >
          Cancel upload
        </Button>
      ) : (
        <div className="flex gap-2">
          {retryFile && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || discarding}
              onClick={() => void upload(retryFile)}
            >
              Retry upload
            </Button>
          )}
          {(asset || retryFile) && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || discarding}
              onClick={() => void removeFile()}
            >
              Discard file
            </Button>
          )}
        </div>
      )}
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
        disabled={
          disabled || uploading || discarding || !projects.length || !!retryFile
        }
        onSubmit={async (p) => {
          transfer.current.attaching = true;
          const current = transfer.current.generation;
          const submittedAsset = transfer.current.asset;
          try {
            const ok = await onSubmit({ ...p, assetId: submittedAsset?.id });
            if (ok) {
              transfer.current.asset = null;
              setAsset(null);
              if (inputRef.current) inputRef.current.value = '';
              setMessage('Evidence submitted.');
            } else if (
              transfer.current.generation !== current &&
              submittedAsset
            ) {
              void discard(submittedAsset.id).catch(() => {});
            }
            return ok;
          } finally {
            transfer.current.attaching = false;
          }
        }}
      />
    </>
  );
}
function Ledger({
  state,
  steward,
  growthPaused,
  busy,
  mutate,
  quick,
}: {
  state: Workspace;
  steward: boolean;
  growthPaused?: boolean;
  busy: boolean;
  mutate: (op: string, p: CommandPayload) => Promise<boolean>;
  quick: (op: string, p: CommandPayload) => Promise<void>;
}) {
  const canRecord =
    steward &&
    !growthPaused &&
    !state.financialRecordsRedactedAt &&
    state.visibility !== 'archived';
  const money = (n: number) => formatMoney(n, state.currency ?? 'USD');
  const reviewed = state.evidence.filter((e) => e.status === 'reviewed');
  const evidence = () =>
    select('evidenceId', 'Reviewed supporting evidence', reviewed, 'title');
  const review = (kind: string, r: ReviewRecord) => (
    <div className="button-row mt-4">
      {steward &&
        r.status === 'submitted' &&
        r.canReview === true &&
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
      {state.financialRecordsRedactedAt && (
        <p className="notice mt-4">
          Financial recording is paused because identifying records were erased.
          Preserved amounts remain available for historical review.
        </p>
      )}
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
              {state.lots.map((l) => (
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
                  <FinancialEvidence
                    id={l.evidenceId}
                    evidence={state.evidence}
                  />
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
            {canRecord && (
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
              {state.settlements.map((s) => (
                <article className="network-card" key={s.id}>
                  <h3>
                    {money(s.cents)} · {s.units} units
                  </h3>
                  <p>{s.reference}</p>
                  <Status value={s.status} />
                  <FinancialEvidence
                    id={s.evidenceId}
                    evidence={state.evidence}
                  />
                  {review('settlement', s)}
                </article>
              ))}
              {!state.settlements.length && (
                <Empty>No external settled-cash records.</Empty>
              )}
            </section>
            {canRecord && (
              <aside className="panel">
                <ActionForm
                  title="Record an external settlement"
                  fields={[
                    select(
                      'lotId',
                      'Reviewed holding',
                      state.lots.filter((l) => l.status === 'reviewed'),
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
                      cents: toMinor(String(p.amount), state.currency ?? 'USD'),
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
              {state.allocations.map((a) => (
                <AllocationRecord
                  key={a.id}
                  allocation={a}
                  state={state}
                  steward={canRecord}
                  busy={busy}
                  mutate={mutate}
                  quick={quick}
                />
              ))}
              {!state.allocations.length && (
                <Empty>
                  Allocations require a reviewed settlement and an adopted
                  charter.
                </Empty>
              )}
            </section>
            {canRecord && (
              <aside className="panel">
                <ActionForm
                  title="Allocate reconciled proceeds"
                  fields={[
                    select(
                      'settlementId',
                      'Reviewed settlement',
                      state.settlements.filter((s) => s.status === 'reviewed'),
                      'reference',
                    ),
                    select(
                      'charterId',
                      'Adopted charter',
                      state.charters.map((c) => ({
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
              {state.retirements.map((r) => (
                <article className="network-card" key={r.id}>
                  <h3>
                    {r.units} units · {r.beneficiary}
                  </h3>
                  <p>{r.reference}</p>
                  <Status value={r.status} />
                  <FinancialEvidence
                    id={r.evidenceId}
                    evidence={state.evidence}
                  />
                  {review('retirement', r)}
                </article>
              ))}
              {!state.retirements.length && (
                <Empty>No external retirement receipts recorded.</Empty>
              )}
            </section>
            {canRecord && (
              <aside className="panel">
                <ActionForm
                  title="Record an external retirement"
                  fields={[
                    select(
                      'settlementId',
                      'Reviewed transfer / settlement',
                      state.settlements.filter((s) => s.status === 'reviewed'),
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

function OrganizationCard({ organization: o }: { organization: Organization }) {
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
function OrganizationDiscovery({ coops }: { coops: PublicCoop[] }) {
  const [region, setRegion] = useState('');
  const organizations = coops.filter(
    (c): c is PublicCoop & { organization: Organization } =>
      !!c.organization &&
      `${c.organization.name} ${c.organization.region} ${c.organization.services}`
        .toLowerCase()
        .includes(region.toLowerCase()),
  );
  return (
    <section className="panel mb-6">
      <h2>Connect with conservation anywhere</h2>
      <ControlLabel>
        Country, territory, town, or region
        <Input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="For example: Kisumu, Kenya; Kerala, India; or your region"
          maxLength={120}
        />
      </ControlLabel>
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
                <Link
                  className="text-link"
                  href={`/network/?coop=${c.id}`}
                  prefetch={false}
                  target="_top"
                >
                  Explore their co-op ↗
                </Link>
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
  members: Member[];
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const [receipt, setReceipt] = useState('1000'),
    [care, setCare] = useState('15'),
    [reserve, setReserve] = useState('10'),
    [shares, setShares] = useState<Record<string, string>>({});
  let result: Amounts | null = null,
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
          <ControlLabel key={String(title)}>
            {String(title)}
            <Input
              type="number"
              min="0"
              step="any"
              value={String(value)}
              onChange={(e) => (setter as (s: string) => void)(e.target.value)}
            />
          </ControlLabel>
        ))}
        {members.map((m) => (
          <ControlLabel key={m.id}>
            {m.name}: share of member pool (%)
            <Input
              type="number"
              min="0"
              max="100"
              step="any"
              value={shares[m.id] ?? ''}
              onChange={(e) => setShares({ ...shares, [m.id]: e.target.value })}
            />
          </ControlLabel>
        ))}
      </div>
      {result ? (
        <div className="notice mt-4">
          <p>
            Stewardship {money(result.stewardshipCents)} · Reserve{' '}
            {money(result.treasuryCents)} · Member pool{' '}
            {money(result.memberPoolCents)}
          </p>
          {result.members.map((m) => (
            <p key={m.id}>
              {m.name}: {money(m.cents)}
            </p>
          ))}
        </div>
      ) : (
        <output className="small mt-4">{error}</output>
      )}
      <p className="small mt-4">
        Illustration only; nothing is saved or paid. Enter the agreed
        percentages in the proposal below. An adopted policy freezes those
        shares for later allocations.
      </p>
    </section>
  );
}

function FinancialEvidence({
  id,
  evidence,
}: {
  id?: string;
  evidence: Evidence[];
}) {
  const record = evidence.find((item) => item.id === id);
  if (!record)
    return (
      <p className="small mt-3">
        Supporting evidence is restricted or no longer available in your
        records. A receipt alone does not verify external activity.
      </p>
    );
  return (
    <details className="mt-3">
      <summary>Supporting evidence: {record.title}</summary>
      <p className="small">
        {record.method} · {record.period}
      </p>
      <p className="small">{record.notes}</p>
      {record.reviewNote && (
        <p className="small">Evidence review: {record.reviewNote}</p>
      )}
      {record.reference && (
        <p>
          <a
            className="text-link"
            href={record.reference}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open supporting reference ↗
          </a>
        </p>
      )}
      {record.asset && (
        <p>
          <a
            className="text-link"
            href={`/api/files?id=${encodeURIComponent(record.asset.id)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open private file: {record.asset.filename}
          </a>
        </p>
      )}
    </details>
  );
}

function AllocationRecord({
  allocation: a,
  state,
  steward,
  busy,
  mutate,
  quick,
}: {
  allocation: Workspace['allocations'][number];
  state: Workspace;
  steward: boolean;
  busy: boolean;
  mutate: (op: string, p: CommandPayload) => Promise<boolean>;
  quick: (op: string, p: CommandPayload) => Promise<void>;
}) {
  const money = (n: number) => formatMoney(n, state.currency ?? 'USD');
  const reconciliation = allocationReconciliation(a);
  const settlement = state.settlements.find((s) => s.id === a.settlementId);
  const projectId = state.lots.find(
    (l) => l.id === settlement?.lotId,
  )?.projectId;
  const evidence = () =>
    select(
      'evidenceId',
      'Reviewed evidence from this project',
      state.evidence.filter(
        (e) => e.status === 'reviewed' && e.projectId === projectId,
      ),
      'title',
    );
  const members = a.amounts.members.filter(
    (m) =>
      m.cents > 0 &&
      !a.payments.some((p) => p.memberId === m.id && p.status !== 'rejected'),
  );
  const receiptReview = (
    kind: 'payment' | 'disbursement',
    record: ReviewRecord,
  ) =>
    steward &&
    record.canReview === true &&
    record.status === 'submitted' && (
      <div className="button-row mt-3">
        {['approve', 'reject'].map((decision) => (
          <Button
            variant="outline"
            key={decision}
            disabled={busy}
            onClick={() =>
              quick(`review_${kind}`, {
                id: a.id,
                [kind === 'payment' ? 'paymentId' : 'disbursementId']:
                  record.id,
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
    );
  return (
    <article className="network-card">
      <h3>Cleared proceeds allocated · {money(a.amounts.grossCents)}</h3>
      <Status value={a.status} />
      <p className="small mt-3">
        These balances reconcile recorded external receipts. They are not a live
        bank balance or instructions to send money. Pending receipts await a
        different steward’s review.
      </p>
      <div className="mt-4 space-y-4">
        {(
          [
            ['total', 'All allocated proceeds'],
            ['memberPool', 'Member payments'],
            ['stewardship', 'Conservation stewardship'],
            ['treasury', 'Treasury reserve transfers'],
          ] as const
        ).map(([key, title]) => (
          <section key={key} aria-label={title}>
            <h4 className="font-semibold">{title}</h4>
            <dl className="ledger">
              <div>
                <dt>Allocated</dt>
                <dd>{money(reconciliation[key].allocatedCents)}</dd>
              </div>
              <div>
                <dt>Reviewed receipts</dt>
                <dd>{money(reconciliation[key].reviewedReceiptCents)}</dd>
              </div>
              <div>
                <dt>Pending review</dt>
                <dd>{money(reconciliation[key].pendingReceiptCents)}</dd>
              </div>
              <div>
                <dt>Without a recorded receipt</dt>
                <dd>{money(reconciliation[key].remainingUnrecordedCents)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <details className="mt-4">
        <summary>Member allocations and platform share</summary>
        <dl className="ledger">
          {a.amounts.members.map((m) => (
            <div key={m.id}>
              <dt>{m.name}</dt>
              <dd>{money(m.cents)}</dd>
            </div>
          ))}
          <div>
            <dt>Platform percentage cut</dt>
            <dd>{money(0)}</dd>
          </div>
        </dl>
      </details>
      {steward && a.status === 'draft' && a.canReview === true && (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() => quick('approve_allocation', { id: a.id })}
        >
          Approve allocation
        </Button>
      )}
      {a.payments.map((p) => (
        <div className="network-card" key={p.id}>
          <p>
            {a.amounts.members.find((m) => m.id === p.memberId)?.name} ·{' '}
            {money(p.cents)}
          </p>
          <p className="small">
            External member payment receipt: {p.reference}
          </p>
          <Status value={p.status} />
          <FinancialEvidence id={p.evidenceId} evidence={state.evidence} />
          {receiptReview('payment', p)}
        </div>
      ))}
      {(a.disbursements ?? []).map((d) => (
        <div className="network-card" key={d.id}>
          <p>
            {d.budget === 'stewardship'
              ? 'Stewardship payment'
              : 'Treasury transfer'}{' '}
            · {money(d.cents)}
          </p>
          <p>
            {d.recipientLabel} · {d.purpose}
          </p>
          <p className="small">External receipt: {d.reference}</p>
          <Status value={d.status} />
          <FinancialEvidence id={d.evidenceId} evidence={state.evidence} />
          {receiptReview('disbursement', d)}
        </div>
      ))}
      {steward && a.status === 'approved' && (
        <>
          {members.length > 0 && (
            <ActionForm
              title="Record a completed external member payment"
              fields={[
                select('memberId', 'Member', members),
                field(
                  'reference',
                  'Unique external payment reference',
                  undefined,
                  { max: 300 },
                ),
                evidence(),
              ]}
              submit="Submit payment receipt"
              onSubmit={(p) => mutate('record_payment', { ...p, id: a.id })}
              disabled={busy}
            />
          )}
          {(['stewardship', 'treasury'] as const).map(
            (budget) =>
              reconciliation[budget].remainingUnrecordedCents > 0 && (
                <section key={budget} className="mt-5">
                  <p className="small">
                    {budget === 'stewardship'
                      ? 'Record a completed conservation payment to a partner or provider. An allocation alone does not mean they have been paid.'
                      : 'Record a completed transfer into the co-op treasury reserve. This is not a conservation expense or a payment to a nonprofit.'}{' '}
                    Recipient and purpose are visible to co-op members; omit
                    bank account numbers.
                  </p>
                  <ActionForm
                    title={
                      budget === 'stewardship'
                        ? 'Record completed stewardship payment'
                        : 'Record completed treasury transfer'
                    }
                    fields={[
                      field(
                        'amount',
                        `Completed amount (${state.currency ?? 'USD'})`,
                      ),
                      field(
                        'recipientLabel',
                        budget === 'stewardship'
                          ? 'Recipient name'
                          : 'Treasury recipient or reserve label',
                        undefined,
                        { max: 160 },
                      ),
                      field(
                        'purpose',
                        'Purpose of the completed payment or transfer',
                        'textarea',
                        { max: 1000 },
                      ),
                      field(
                        'reference',
                        'Unique external receipt reference',
                        undefined,
                        { max: 300 },
                      ),
                      evidence(),
                    ]}
                    submit="Submit completed transfer receipt"
                    onSubmit={(p) =>
                      mutate('record_disbursement', {
                        ...p,
                        id: a.id,
                        budget,
                        cents: toMinor(
                          String(p.amount),
                          state.currency ?? 'USD',
                        ),
                      })
                    }
                    disabled={busy}
                  />
                </section>
              ),
          )}
        </>
      )}
    </article>
  );
}
