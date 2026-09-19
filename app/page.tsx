import Link from 'next/link';
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
const sourceRepo = `${repo}/tree/build/coop-launch-readiness`;
export default function Home({ publicPreview = false }: { publicPreview?: boolean } = {}) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <Link className="brand" href="/">
          <Sprout aria-hidden="true" />
          verge common<span className="brand-dot">●</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href={publicPreview ? "/demo/" : "/network/"}>{publicPreview ? "Plan a project" : "Projects"}</Link>
          <Link href={publicPreview ? "#contribute" : "/workspace/"}>{publicPreview ? "Contribute" : "My co-ops"}</Link>
          <a className="nav-repo" href={sourceRepo}>
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
                What if conservation
                <br />
                were <em>open source?</em>
              </h1>
              <p className="intro">
                Enter VergeCommon. Open tools for people caring for the places
                they share. Organize a conservation project, document the work,
                and make decisions together. Help build tools any community can
                inspect, adapt, and improve.
              </p>
              <div className="actions">
                <a className="button primary" href={repo}>
                  Build with us on GitHub <ArrowRight size={18} />
                </a>
                <Link className="text-link" href="/demo/">
                  Try the local planner <ArrowUpRight size={17} />
                </Link>
              </div>
              <p className="fine">
                Early community pilot · AGPL-3.0-only. The planner stores
                drafts on your device. {publicPreview ? 'Shared community accounts are being prepared and are not available on this site yet.' : 'Shared co-ops require sign-in and membership approval.'}
              </p>
            </div>
            <aside className="field-note">
              <div className="note-head">
                <span>THE COMMON GROUND</span>
                <Sprout size={28} />
              </div>
              <p className="note-title">
                Local knowledge.
                <br />
                Shared tools.
              </p>
              <div className="note-row">
                <MapPin />
                <div>
                  <strong>Start with a place</strong>
                  <span>
                    EcoHedge corridors, woodlots, and larger conservation
                    projects.
                  </span>
                </div>
              </div>
              <div className="note-row">
                <Users />
                <div>
                  <strong>Organize the work</strong>
                  <span>
                    Plan activities, invite members, and keep a record of what happened.
                  </span>
                </div>
              </div>
              <div className="note-row">
                <BookOpen />
                <div>
                  <strong>Make decisions together</strong>
                  <span>
                    Propose policies, vote, and inspect the shared record.
                  </span>
                </div>
              </div>
              <div className="note-foot">
                PLACE → PEOPLE → ACTION → EVIDENCE
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
              A hedgerow, a woodlot, or a larger landscape: conservation starts
              with people who know and care for a place. They need practical
              ways to organize, learn from each other, and keep evidence of
              their work.
            </p>
            <p>
              VergeCommon brings projects, community activities, private field
              records, and cooperative decisions into one workspace. Open
              source lets communities inspect the code, adapt the workflows,
              and contribute improvements back.
            </p>
            <p>
              Open code does not mean open private data. Exact locations,
              agreements, and field evidence have access controls. Public
              discovery uses only explicitly shared summaries and general
              regions. Environmental outcomes still need independent evidence.
            </p>
          </div>
        </section>
        <section className="wrap release">
          <div className="section-head">
            <div>
              <p className="eyebrow">02 / WHAT YOU CAN BUILD ON</p>
              <h2>Organize. Document. Decide.</h2>
            </div>
            <span className="pill">EARLY CONTRIBUTOR PREVIEW</span>
          </div>
          <div className="three-grid">
            <article>
              <span className="index">01</span>
              <h3>Community action</h3>
              <p>
                Create a co-op, organize projects and events, invite members,
                and track shared conservation actions. Start small and learn
                from one useful activity.
              </p>
            </article>
            <article>
              <span className="index">02</span>
              <h3>Private evidence</h3>
              <p>
                Draw project boundaries, record field observations, and submit
                supporting files for review. Mapping and satellite screening
                support investigation; they do not certify ecological outcomes.
              </p>
            </article>
            <article>
              <span className="index">03</span>
              <h3>Shared decisions</h3>
              <p>
                Propose a charter, vote on allocation policies, and review
                externally documented financial records. The software records
                decisions and receipts; it does not send payments.
              </p>
            </article>
          </div>
          <p className="release-note">
            {publicPreview ? 'Implemented in the open-source application; shared hosting is still being prepared:' : 'Available now:'} shared co-op workspaces, membership, projects,
            evidence, governance, and external receipt records. Open agreement
            workflows connect these records. Legally executed easements,
            registry operations, and actual payments remain the responsibility
            of authorized parties.
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
                You do not need to write code. Test a workflow, improve a field
                guide, review accessibility, or help a local group describe
                what it needs. Developers can help turn that knowledge into
                shared tools. Our first milestone: one community completing
                useful work and returning to do it again.
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
        <Link className="brand" href="/">
          <Sprout />
          verge common
        </Link>
        <span>Open code. Cooperative conservation.</span>
        <div>
          <a href={`${repo}/blob/main/LICENSE`}>AGPL-3.0</a>
          <a href={`${repo}/blob/build/coop-launch-readiness/PRIVACY.md`}>Privacy</a>
          <a href={repo}>GitHub ↗</a>
        </div>
      </footer>
    </>
  );
}
