import {
  ArrowUpRight,
  ArrowRight,
  Sprout,
  Code2,
  MapPin,
  Users,
  BookOpen,
} from 'lucide-react';
const repo = 'https://github.com/jdhart81/verge-common';
export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <a className="brand" href="/">
          <Sprout aria-hidden="true" />
          verge common<span className="brand-dot">●</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#mission">The mission</a>
          <a href="#contribute">Contribute</a>
          <a className="nav-repo" href={repo}>
            <Code2 size={18} />
            Source <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="eyebrow">
            <span className="signal" /> OPEN SOURCE · COMMON GROUND
          </div>
          <div className="hero-grid">
            <div>
              <h1>
                Conserve together.
                <br />
                Share the <em>returns.</em>
              </h1>
              <p className="intro">
                The open-source cooperative system for EcoHedge projects and
                larger conservation parcels. Bring land commitments, pooled
                carbon accounting, and transparent member payouts into one
                commons.
              </p>
              <div className="actions">
                <a className="button primary" href="/coop/">
                  Explore the co-op workbench <ArrowRight size={18} />
                </a>
                <a className="text-link" href={repo}>
                  Explore the source <ArrowUpRight size={17} />
                </a>
              </div>
              <p className="fine">
                Working scenario model. No live credit issuance or money
                movement.
              </p>
            </div>
            <aside className="field-note">
              <div className="note-head">
                <span>THE COOPERATIVE MODEL</span>
                <Sprout size={28} />
              </div>
              <p className="note-title">
                Many parcels.
                <br />
                One governed pool.
              </p>
              <div className="note-row">
                <MapPin />
                <div>
                  <strong>Bring land into the co-op</strong>
                  <span>
                    EcoHedge corridors, woodlots, and larger conservation
                    projects.
                  </span>
                </div>
              </div>
              <div className="note-row">
                <Users />
                <div>
                  <strong>Pool eligible contributions</strong>
                  <span>
                    Preserve each project’s evidence, rights, and vintage.
                  </span>
                </div>
              </div>
              <div className="note-row">
                <BookOpen />
                <div>
                  <strong>Distribute proceeds transparently</strong>
                  <span>
                    Member-approved costs, reserves, and exact-cent allocations.
                  </span>
                </div>
              </div>
              <div className="note-foot">
                LAND → AGREEMENT → POOL → PROCEEDS
              </div>
            </aside>
          </div>
        </section>
        <div className="principle-band">
          <span>Open-source infrastructure.</span>
          <span>Member-governed conservation.</span>
          <span>Transparent benefit sharing.</span>
        </div>
        <section id="mission" className="wrap mission">
          <div>
            <p className="eyebrow">01 / WHY WE EXIST</p>
            <h2>
              Conservation at
              <br />
              the scale of a landscape.
            </h2>
          </div>
          <div className="mission-copy">
            <p>
              An EcoHedge project and a larger conserved parcel can participate
              in the same cooperative structure. Verge Common is designed to
              coordinate their agreements, stewardship obligations, evidence,
              and shares of collective value.
            </p>
            <p>
              The co-op governs the pool. Landowners retain the rights defined
              in their agreements; qualified easement holders retain their
              responsibilities. Verge Common supplies the open infrastructure,
              without taking a percentage of credit sales.
            </p>
            <p>
              Open code and reusable agreement workflows make the model
              inspectable and adaptable. An easement alone does not create
              carbon credits: eligible projects still need an accepted method,
              review, and issuance process.
            </p>
          </div>
        </section>
        <section className="wrap release">
          <div className="section-head">
            <div>
              <p className="eyebrow">02 / THE OPERATING SYSTEM</p>
              <h2>From land to shared benefit.</h2>
            </div>
            <span className="pill">COOPERATIVE PREVIEW · v0.2</span>
          </div>
          <div className="three-grid">
            <article>
              <span className="index">01</span>
              <h3>Conservation commitments</h3>
              <p>
                Open enrollment and easement intake workflows capture rights,
                obligations, counterparties, and review milestones. Legal
                execution and recording remain separate.
              </p>
            </article>
            <article>
              <span className="index">02</span>
              <h3>Cooperative credit pools</h3>
              <p>
                Model contributions by project and vintage, set ecological
                reserves, and preserve provenance. Mixed methods and
                incompatible vintages cannot simply be merged.
              </p>
            </article>
            <article>
              <span className="index">03</span>
              <h3>Member payouts</h3>
              <p>
                Inspect a proceeds waterfall for stewardship, treasury reserves,
                and member allocations. Each cent is accounted for under an
                explicit draft share schedule.
              </p>
            </article>
          </div>
          <p className="release-note">
            Available now: an editable co-op scenario, exact accounting, draft
            agreement packet, and open architecture. Shared records, executed
            easements, registry operations, and actual payouts are not live.
          </p>
        </section>
        <section id="contribute" className="contribute">
          <div className="wrap">
            <p className="eyebrow">03 / BUILD WITH US</p>
            <h2>
              A conservation model
              <br />
              any community can build on.
            </h2>
            <div className="contribute-bottom">
              <p>
                Help build the common infrastructure: landowners, EcoHedge
                organizers, land trusts, cooperative practitioners, carbon
                specialists, and developers. Start with the open system design,
                challenge an assumption, or improve a workflow.
              </p>
              <a
                className="button light"
                href={`${repo}/blob/main/CONTRIBUTING.md`}
              >
                Find your first contribution <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="wrap footer">
        <a className="brand" href="/">
          <Sprout />
          verge common
        </a>
        <span>Open code. Cooperative conservation.</span>
        <div>
          <a href={`${repo}/blob/main/LICENSE`}>AGPL-3.0</a>
          <a href={`${repo}/blob/main/PRIVACY.md`}>Privacy</a>
          <a href={repo}>GitHub ↗</a>
        </div>
      </footer>
    </>
  );
}
