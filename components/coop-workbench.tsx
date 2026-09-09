'use client';
import { useMemo, useState } from 'react';
import { Sprout, ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  calculateCooperative,
  exampleCooperative,
  scenarioPacket,
} from '@/lib/cooperative.mjs';
const repo = 'https://github.com/jdhart81/verge-common/blob/main';
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
const tonnes = (kg: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(
    kg / 1000,
  );
export function CoopWorkbench() {
  const [scenario, setScenario] = useState(exampleCooperative);
  const [status, setStatus] = useState('');
  const computed = useMemo(() => {
    try {
      return { value: calculateCooperative(scenario), error: '' };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [scenario]);
  const result = computed.value;
  function changeProject(id: string, field: string, value: string | number) {
    setScenario((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      ),
    }));
  }
  function policy(field: string, value: number) {
    setScenario((s) => ({ ...s, policy: { ...s.policy, [field]: value } }));
  }
  function download() {
    try {
      const packet = scenarioPacket(scenario);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(packet, null, 2)], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verge-common-cooperative-draft.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        'Draft downloaded. It contains scenario inputs, modeled allocations, and uncompleted agreement review fields.',
      );
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to workbench
      </a>
      <header className="nav">
        <a className="brand" href="/">
          <Sprout />
          verge common
        </a>
        <a href="/" className="text-link">
          <ArrowLeft size={16} />
          The mission
        </a>
      </header>
      <main id="main" className="wrap planner coop">
        <div className="section-head">
          <div>
            <p className="eyebrow">
              COOPERATIVE WORKBENCH / ILLUSTRATIVE SCENARIO
            </p>
            <h1>Many parcels. One commons.</h1>
          </div>
          <Button className="h-11 px-4" disabled={!result} onClick={download}>
            <Download />
            Export draft packet
          </Button>
        </div>
        <p className="intro">
          Model an EcoHedge and conservation-land cooperative, from project
          contributions to member allocations.
        </p>
        <div className="notice">
          Hypothetical inputs, not measurements or earnings. Changes last for
          this page session; export to keep a copy. No agreement is executed,
          credit issued, or payout sent.
        </div>
        <div className="coop-summary" aria-label="Modeled results">
          <div>
            <span>Projects in scenario</span>
            <strong>{scenario.projects.length}</strong>
          </div>
          <div>
            <span>Pool after ecological reserve</span>
            <strong>
              {result ? tonnes(result.modeledCapacityKg) : '—'}{' '}
              <small>tCO₂e</small>
            </strong>
          </div>
          <div>
            <span>Modeled member pool</span>
            <strong>{result ? money(result.memberPoolCents) : '—'}</strong>
          </div>
          <div>
            <span>Platform sales cut</span>
            <strong>0%</strong>
          </div>
        </div>
        {computed.error && (
          <p className="notice error" role="alert">
            {computed.error} Adjust the inputs to calculate allocations.
          </p>
        )}
        <Tabs defaultValue="projects" className="mt-7">
          <TabsList className="coop-tabs">
            <TabsTrigger value="projects">Projects & members</TabsTrigger>
            <TabsTrigger value="pool">Pooled vintage</TabsTrigger>
            <TabsTrigger value="payouts">Member payouts</TabsTrigger>
            <TabsTrigger value="agreements">
              Conservation agreements
            </TabsTrigger>
          </TabsList>
          <TabsContent value="projects">
            <section className="panel mt-5">
              <h2>The participating projects</h2>
              <p className="small">
                These are invented examples. An EcoHedge project and a large
                parcel share a co-op structure, but actual pooling depends on
                compatible program and method rules.
              </p>
              <label htmlFor="coop-name">Co-op name</label>
              <Input
                id="coop-name"
                maxLength={120}
                value={scenario.name}
                onChange={(e) =>
                  setScenario((s) => ({ ...s, name: e.target.value }))
                }
              />
              {scenario.projects.map((p) => (
                <div className="project-input" key={p.id}>
                  <div>
                    <label htmlFor={`${p.id}-name`}>Project</label>
                    <Input
                      id={`${p.id}-name`}
                      maxLength={100}
                      value={p.name}
                      onChange={(e) =>
                        changeProject(p.id, 'name', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`${p.id}-kind`}>Type</label>
                    <NativeSelect
                      id={`${p.id}-kind`}
                      value={p.kind}
                      onChange={(e) =>
                        changeProject(p.id, 'kind', e.target.value)
                      }
                    >
                      <NativeSelectOption value="ecohedge">
                        EcoHedge
                      </NativeSelectOption>
                      <NativeSelectOption value="landscape">
                        Conservation parcel
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div>
                    <label htmlFor={`${p.id}-member`}>Member</label>
                    <NativeSelect
                      id={`${p.id}-member`}
                      value={p.memberId}
                      onChange={(e) =>
                        changeProject(p.id, 'memberId', e.target.value)
                      }
                    >
                      {scenario.members.map((m) => (
                        <NativeSelectOption key={m.id} value={m.id}>
                          {m.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div>
                    <label htmlFor={`${p.id}-kg`}>Scenario kg CO₂e</label>
                    <Input
                      id={`${p.id}-kg`}
                      type="number"
                      min={0}
                      step={1}
                      value={p.contributionKg}
                      onChange={(e) =>
                        changeProject(
                          p.id,
                          'contributionKg',
                          e.target.value === '' ? -1 : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Remove ${p.name}`}
                    onClick={() =>
                      setScenario((s) => ({
                        ...s,
                        projects: s.projects.filter((x) => x.id !== p.id),
                      }))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="h-11 mt-5"
                onClick={() =>
                  setScenario((s) => ({
                    ...s,
                    projects: [
                      ...s.projects,
                      {
                        id: crypto.randomUUID(),
                        name: 'New project',
                        kind: 'ecohedge',
                        memberId: s.members[0].id,
                        contributionKg: 0,
                        poolKey: s.poolKey,
                      },
                    ],
                  }))
                }
              >
                <Plus />
                Add project
              </Button>
              <p className="small mt-5">
                Member share weights are draft policy inputs. Parcel size alone
                does not determine a member’s share. Edit the schedule under
                Member payouts.
              </p>
            </section>
          </TabsContent>
          <TabsContent value="pool">
            <div className="coop-two mt-5">
              <section className="panel">
                <h2>One compatible vintage</h2>
                <label htmlFor="scope">Method / vintage / program scope</label>
                <Input
                  id="scope"
                  maxLength={180}
                  value={scenario.poolKey}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      poolKey: e.target.value,
                      projects: s.projects.map((p) => ({
                        ...p,
                        poolKey: e.target.value,
                      })),
                    }))
                  }
                />
                <p className="small mt-3">
                  A scenario label only. Matching labels do not establish real
                  eligibility. Actual holdings must retain registry, project,
                  method, vintage, serial range, and custody records.
                </p>
                <label htmlFor="buffer">Ecological reserve (%)</label>
                <Input
                  id="buffer"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={scenario.policy.ecologicalReserveBps / 100}
                  onChange={(e) =>
                    policy(
                      'ecologicalReserveBps',
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
                <label htmlFor="sale">Proposed sale (whole kg CO₂e)</label>
                <Input
                  id="sale"
                  type="number"
                  min={0}
                  step={1}
                  value={scenario.policy.saleKg}
                  onChange={(e) =>
                    policy(
                      'saleKg',
                      e.target.value === '' ? -1 : Number(e.target.value),
                    )
                  }
                />
                <label htmlFor="price">
                  Hypothetical price (USD per tonne)
                </label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={scenario.policy.priceCentsPerTonne / 100}
                  onChange={(e) =>
                    policy(
                      'priceCentsPerTonne',
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
              </section>
              <section className="panel">
                <h2>The modeled quantity ledger</h2>
                {result ? (
                  <>
                    <dl className="ledger">
                      <div>
                        <dt>Input contributions</dt>
                        <dd>{tonnes(result.grossKg)} tCO₂e</dd>
                      </div>
                      <div>
                        <dt>Ecological reserve</dt>
                        <dd>{tonnes(result.ecologicalReserveKg)} tCO₂e</dd>
                      </div>
                      <div>
                        <dt>Pool after reserve</dt>
                        <dd>{tonnes(result.modeledCapacityKg)} tCO₂e</dd>
                      </div>
                      <div>
                        <dt>Proposed sale</dt>
                        <dd>{tonnes(result.saleKg)} tCO₂e</dd>
                      </div>
                      <div>
                        <dt>Remaining in modeled pool</dt>
                        <dd>{tonnes(result.unsoldKg)} tCO₂e</dd>
                      </div>
                    </dl>
                    <p className="small mt-5">
                      Contributions = reserve + proposed sale + remaining pool.
                      The reserve rounds up to whole kilograms. Overselling is
                      rejected.
                    </p>
                  </>
                ) : (
                  <p className="small">
                    Correct the scenario inputs to show the ledger.
                  </p>
                )}
                <div className="notice mt-5">
                  No eligible or issued credits are established by this
                  calculation. Actual issuance requires the applicable program’s
                  independent process.
                </div>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="payouts">
            <div className="coop-two mt-5">
              <section className="panel">
                <h2>Draft allocation policy</h2>
                <p className="small">
                  Model a member-approved share schedule. These percentages are
                  not an adopted charter or a legal entitlement.
                </p>
                <div className="policy-pair">
                  <div>
                    <label htmlFor="steward">Stewardship (%)</label>
                    <Input
                      id="steward"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={scenario.policy.stewardshipBps / 100}
                      onChange={(e) =>
                        policy(
                          'stewardshipBps',
                          Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="treasury">Treasury reserve (%)</label>
                    <Input
                      id="treasury"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={scenario.policy.treasuryBps / 100}
                      onChange={(e) =>
                        policy(
                          'treasuryBps',
                          Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </div>
                </div>
                {scenario.members.map((m) => (
                  <div className="policy-pair" key={m.id}>
                    <div>
                      <label htmlFor={`${m.id}-name`}>Member name</label>
                      <Input
                        id={`${m.id}-name`}
                        maxLength={100}
                        value={m.name}
                        onChange={(e) =>
                          setScenario((s) => ({
                            ...s,
                            members: s.members.map((x) =>
                              x.id === m.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor={`${m.id}-share`}>
                        Share of member pool (%)
                      </label>
                      <Input
                        id={`${m.id}-share`}
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={m.shareBps / 100}
                        onChange={(e) =>
                          setScenario((s) => ({
                            ...s,
                            members: s.members.map((x) =>
                              x.id === m.id
                                ? {
                                    ...x,
                                    shareBps: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                  }
                                : x,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="mt-5 h-11"
                  onClick={() =>
                    setScenario((s) => ({
                      ...s,
                      members: [
                        ...s.members,
                        {
                          id: crypto.randomUUID(),
                          name: 'New member',
                          shareBps: 0,
                        },
                      ],
                    }))
                  }
                >
                  <Plus />
                  Add member
                </Button>
                <p className="small mt-4">
                  Total:{' '}
                  {scenario.members.reduce((sum, m) => sum + m.shareBps, 0) /
                    100}
                  %. Must equal 100%.
                </p>
              </section>
              <section className="panel">
                <h2>Where the modeled proceeds go</h2>
                {result ? (
                  <>
                    <dl className="ledger">
                      <div>
                        <dt>Hypothetical gross proceeds</dt>
                        <dd>{money(result.proceedsCents)}</dd>
                      </div>
                      <div>
                        <dt>Co-op stewardship budget</dt>
                        <dd>{money(result.stewardshipCents)}</dd>
                      </div>
                      <div>
                        <dt>Co-op treasury reserve</dt>
                        <dd>{money(result.treasuryCents)}</dd>
                      </div>
                      <div>
                        <dt>Member pool</dt>
                        <dd>{money(result.memberPoolCents)}</dd>
                      </div>
                      <div>
                        <dt>Platform percentage fee</dt>
                        <dd>{money(result.platformCutCents)}</dd>
                      </div>
                    </dl>
                    <h3 className="mt-7 mb-3 text-lg font-semibold">
                      Modeled member allocations
                    </h3>
                    <dl className="ledger">
                      {result.allocations.map((m) => (
                        <div key={m.id}>
                          <dt>{m.name}</dt>
                          <dd>{money(m.cents)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="small mt-5">
                      All cents close exactly. Fractional cents use largest
                      remainders with stable member-ID tie breaking. Treasury
                      and stewardship are retained by the co-op, not platform
                      fees.
                    </p>
                  </>
                ) : (
                  <p>Correct the inputs to show allocations.</p>
                )}
                <div className="notice mt-5">
                  These are allocations in a scenario, not settled proceeds or
                  paid dividends. Actual payouts require an adopted policy, a
                  settlement receipt, authorized approval, and payment
                  reconciliation.
                </div>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="agreements">
            <section className="panel mt-5">
              <h2>Open agreement workflows</h2>
              <p>
                Conservation commitments connect the land to the co-op. A
                conservation easement, a stewardship agreement, and a
                carbon-rights agreement are distinct instruments; no one
                document substitutes for all three.
              </p>
              <div className="three-grid">
                <article>
                  <span className="index">01 / LAND & RIGHTS</span>
                  <h3>Enrollment intake</h3>
                  <p>
                    Identify the project, authorized landowner, relevant land
                    rights, consent, and stewardship responsibilities.
                  </p>
                  <a
                    className="text-link"
                    href={`${repo}/templates/ENROLLMENT_INTAKE.md`}
                  >
                    Open intake template ↗
                  </a>
                </article>
                <article>
                  <span className="index">02 / CONSERVATION</span>
                  <h3>Easement review</h3>
                  <p>
                    Track the jurisdiction, qualified holder, baseline,
                    restrictions, monitoring, counsel review, execution, and
                    recording.
                  </p>
                  <a
                    className="text-link"
                    href={`${repo}/templates/EASEMENT_REVIEW.md`}
                  >
                    Open review template ↗
                  </a>
                </article>
                <article>
                  <span className="index">03 / SHARED VALUE</span>
                  <h3>Co-op payout policy</h3>
                  <p>
                    Document member shares, approved costs, reserves, voting,
                    settlement receipts, disputes, and payment reconciliation.
                  </p>
                  <a
                    className="text-link"
                    href={`${repo}/templates/COOP_CHARTER_AND_PAYOUTS.md`}
                  >
                    Open policy template ↗
                  </a>
                </article>
              </div>
              <p className="notice mt-5">
                Reusable draft workflows, not ready-to-sign legal instruments.
                Recording and enforcement belong to the authorized parties. Open
                sourcing the workflow does not publish private signed
                agreements.
              </p>
              <a
                className="text-link mt-5"
                href={`${repo}/docs/COOPERATIVE_SYSTEM.md`}
              >
                Read the complete operating model ↗
              </a>
            </section>
          </TabsContent>
        </Tabs>
        <p role="status" className="status">
          {status}
        </p>
        <p className="small mt-5">
          Need to plan a workday? The{' '}
          <a className="underline" href="/demo/">
            local stewardship planner
          </a>{' '}
          remains available alongside the cooperative workbench.
        </p>
      </main>
    </>
  );
}
