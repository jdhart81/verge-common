import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Sprout,
  Code2,
  MapPin,
  Users,
  BookOpen,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { ConservationLandscape } from '@/components/conservation-landscape';
import './home.css';

const repo = 'https://github.com/jdhart81/verge-common';
const sourceRepo = repo + '/tree/build/coop-launch-readiness';
const docs = repo + '/blob/build/coop-launch-readiness';

export default function Home({
  publicPreview = false,
}: { publicPreview?: boolean } = {}) {
  const startLink = publicPreview
    ? '/demo/'
    : '/account?mode=register&returnTo=%2Fworkspace%2F';
  return (
    <div className="mission-home">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav home-nav">
        <Link className="brand" href="/" aria-label="VergeCommon home">
          <Sprout aria-hidden="true" />{' '}
          <span>
            verge common
            <span className="brand-dot" aria-hidden="true">
              ●
            </span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a className="home-how-link" href="#how-it-works">
            How it works
          </a>
          <Link href={publicPreview ? '/demo/' : '/network/'}>
            {publicPreview ? 'Try the planner' : 'Find a co-op'}
          </Link>
          <a
            className="home-signin"
            href={publicPreview ? '#contribute' : '/account'}
          >
            {publicPreview ? 'Contribute' : 'Sign in'}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero wrap home-hero" aria-labelledby="home-title">
          <div className="hero-grid">
            <div className="home-hero-copy">
              <p className="eyebrow">
                <span className="signal" aria-hidden="true" /> OPEN SOURCE.
                COMMON GROUND.
              </p>
              <h1 id="home-title">
                What if conservation
                <br />
                were <em>open source?</em>
              </h1>
              <p className="intro">
                Your land. Your neighbors. A shared future.
                <br />
                VergeCommon helps communities connect the places they care for,
                work with local conservation groups, and make decisions
                together.
              </p>
              <div className="actions">
                <a className="button primary" href={startLink}>
                  {publicPreview ? 'Plan your first project' : 'Start a co-op'}
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
                <Link
                  className="text-link"
                  href={publicPreview ? '#how-it-works' : '/network/'}
                >
                  {publicPreview ? 'See how it works' : 'Explore the community'}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              </div>
              <p className="home-try">
                Just looking?{' '}
                <Link href="/demo/">Try a plan without an account.</Link>
              </p>
              <p className="fine home-pilot">
                <span aria-hidden="true" />{' '}
                {publicPreview
                  ? 'Contributor preview · Plans stay in this browser.'
                  : 'Early community pilot · Built with people who care for a place.'}
              </p>
            </div>
            <ConservationLandscape />
          </div>
        </section>
        <div className="home-principles">
          <div className="wrap">
            <span>
              <Users size={18} aria-hidden="true" /> Led by the community
            </span>
            <span>
              <ShieldCheck size={18} aria-hidden="true" /> Private records,
              shared purpose
            </span>
            <a href={sourceRepo}>
              <Code2 size={18} aria-hidden="true" /> Open code, open to everyone
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
        <section
          id="how-it-works"
          className="wrap home-how"
          aria-labelledby="how-title"
        >
          <div className="home-section-intro">
            <div>
              <p className="eyebrow">01 / FROM NEIGHBORS TO A CO-OP</p>
              <h2 id="how-title">
                Small places.
                <br />
                <em>More possibility together.</em>
              </h2>
            </div>
            <p>
              A hedgerow can connect to a woodlot. A group of neighbors can care
              for both. Start with one place and one useful action, then build
              from there.
            </p>
          </div>
          <ol className="home-steps">
            <li>
              <div className="home-step-top">
                <span>01</span>
                <Users aria-hidden="true" />
              </div>
              <h3>Bring people together</h3>
              <p>
                Start a co-op, invite your neighbors, and decide what you want
                to care for. Landowners, volunteers and conservation
                practitioners all have a part to play.
              </p>
            </li>
            <li>
              <div className="home-step-top">
                <span>02</span>
                <MapPin aria-hidden="true" />
              </div>
              <h3>Connect your places</h3>
              <p>
                Map parcels and explore a shared conservation project. Record
                each person’s consent and work with a willing local nonprofit on
                the right agreements.
              </p>
            </li>
            <li>
              <div className="home-step-top">
                <span>03</span>
                <BookOpen aria-hidden="true" />
              </div>
              <h3>Care, record, decide</h3>
              <p>
                Plan activities, keep field evidence, and make cooperative
                decisions. Build a shared record that can support a conservation
                or carbon-program review.
              </p>
            </li>
          </ol>
        </section>
        <section className="home-common-ground" aria-labelledby="common-title">
          <div className="wrap home-common-grid">
            <div>
              <p className="eyebrow">02 / MORE THAN A MAP</p>
              <h2 id="common-title">
                A place for the people
                <br />
                <em>behind the landscape.</em>
              </h2>
              <p>
                A shared workspace for the everyday work of conservation, from
                your first habitat walk to a longer-term plan.
              </p>
              <Link
                className="text-link"
                href={publicPreview ? '/demo/' : '/network/'}
              >
                {publicPreview
                  ? 'Try the local planner'
                  : 'Find your common ground'}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <dl className="home-tools">
              <div>
                <dt>
                  <Users size={21} aria-hidden="true" /> Keep the conversation
                  going
                </dt>
                <dd>
                  Updates, discussions, events and shared tasks keep people
                  involved between field days.
                </dd>
              </div>
              <div>
                <dt>
                  <ShieldCheck size={21} aria-hidden="true" /> Share with care
                </dt>
                <dd>
                  Public profiles share general regions and chosen updates.
                  Access to land records and evidence is limited to authorized
                  people.
                </dd>
              </div>
              <div>
                <dt>
                  <BookOpen size={21} aria-hidden="true" /> Decide how you work
                  together
                </dt>
                <dd>
                  Agree on a charter, vote on proposals, and keep transparent
                  records of responsibilities and benefit sharing.
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <section
          className="wrap home-questions"
          aria-labelledby="questions-title"
        >
          <div>
            <p className="eyebrow">03 / BEFORE YOU BEGIN</p>
            <h2 id="questions-title">
              Common questions.
              <br />
              Clear starting points.
            </h2>
            <p>
              Conservation depends on trust. Here is what the platform helps you
              do, and what still needs a conversation.
            </p>
          </div>
          <div className="home-faq">
            <details>
              <summary>
                Do I need to own land?
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                No. A co-op can bring together landowners, neighbors, volunteers
                and conservation practitioners. Each co-op decides its
                membership and roles. Land contributions need permission from
                the people with the relevant rights.
              </p>
            </details>
            <details>
              <summary>
                What does pooling land mean?
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                It means coordinating separate parcels as part of a shared
                conservation project. Drawing a boundary or joining a co-op does
                not transfer ownership or create a legal agreement. Members
                document consent and arrange appropriate agreements with
                qualified partners.
              </p>
            </details>
            <details>
              <summary>
                How does a conservation nonprofit take part?
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                Invite a local organization to discuss your project. If it
                agrees to participate, your co-op can record its role,
                supporting evidence and project-specific agreements. An
                organization listed in a search is not automatically a verified
                partner.
              </p>
            </details>
            <details>
              <summary>
                Can a co-op earn carbon income?
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                That may be a pathway for some projects. VergeCommon helps
                organize the land, consent, monitoring and cooperative records
                needed for review. Eligibility, independent verification,
                registry issuance, sales and payments require external partners.
                The platform does not issue credits, send payouts or promise an
                income.
              </p>
            </details>
            <details>
              <summary>
                What is available today?
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {publicPreview
                  ? 'This preview includes a local planner. The open-source application also includes'
                  : 'The early pilot includes'}{' '}
                accounts, co-ops, invitations, project discussions, activities,
                land and evidence records, and cooperative decisions. You can
                also connect compatible agents with limited permissions.{' '}
                {publicPreview
                  ? 'Shared accounts are not hosted by this static preview.'
                  : 'Shared co-ops require sign-in and membership approval.'}{' '}
                <a href={docs + '/docs/FEATURE_ACCEPTANCE.md'}>
                  Read the current feature status.
                </a>
              </p>
            </details>
          </div>
        </section>
        <section
          id="contribute"
          className="home-invitation"
          aria-labelledby="join-title"
        >
          <div className="wrap">
            <p className="eyebrow">A COMMONS WE CAN BUILD TOGETHER</p>
            <h2 id="join-title">
              Start with a place.
              <br />
              <em>Invite someone who cares.</em>
            </h2>
            <div className="home-invitation-bottom">
              <p>
                You do not need a finished plan. Bring an idea, a neighbor, or a
                question. Help shape tools that any community can inspect, adapt
                and improve.
              </p>
              <a className="button primary" href={startLink}>
                {publicPreview ? 'Start a local plan' : 'Start your community'}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
            <div className="home-contributor">
              <span>
                Want to help build the tools? Code, field knowledge and
                thoughtful feedback are all welcome.
              </span>
              <a href={docs + '/CONTRIBUTING.md'}>
                Contribute to VergeCommon
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="wrap footer home-footer">
        <Link className="brand" href="/">
          <Sprout aria-hidden="true" />
          <span>verge common</span>
        </Link>
        <span>Open code. Cooperative conservation.</span>
        <div>
          <a href={docs + '/LICENSE'}>AGPL-3.0</a>
          <a href={docs + '/PRIVACY.md'}>Privacy</a>
          <a href={sourceRepo}>
            Source
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
