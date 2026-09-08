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
                Care for a place.
                <br />
                Build a <em>commons.</em>
              </h1>
              <p className="intro">
                The living world is local. So is the work of caring for it.
                Free, open-source tools to help neighbors turn a shared place
                into shared action.
              </p>
              <div className="actions">
                <a className="button primary" href="/demo/">
                  Try the community edition <ArrowRight size={18} />
                </a>
                <a className="text-link" href={repo}>
                  Explore the source <ArrowUpRight size={17} />
                </a>
              </div>
              <p className="fine">
                Early community edition. Free to use, study, change, and share.
              </p>
            </div>
            <aside className="field-note">
              <div className="note-head">
                <span>FIELD NOTE / 001</span>
                <Sprout size={28} />
              </div>
              <p className="note-title">
                A little place.
                <br />A shared purpose.
              </p>
              <div className="note-row">
                <MapPin />
                <div>
                  <strong>Choose a place</strong>
                  <span>A garden, a stream, a patch of neighborhood.</span>
                </div>
              </div>
              <div className="note-row">
                <Users />
                <div>
                  <strong>Plan one useful action</strong>
                  <span>Start small. Make it something you can repeat.</span>
                </div>
              </div>
              <div className="note-row">
                <BookOpen />
                <div>
                  <strong>Share what you learn</strong>
                  <span>Let the next community build on your work.</span>
                </div>
              </div>
              <div className="note-foot">
                PLACE → ACTION → LEARNING → REPEAT
              </div>
            </aside>
          </div>
        </section>
        <div className="principle-band">
          <span>Built in the open.</span>
          <span>Rooted in local care.</span>
          <span>Made to be shared.</span>
        </div>
        <section id="mission" className="wrap mission">
          <div>
            <p className="eyebrow">01 / WHY WE EXIST</p>
            <h2>
              The commons starts
              <br />
              where you are.
            </h2>
          </div>
          <div className="mission-copy">
            <p>
              Healthy places need people who know them, care for them, and keep
              showing up. Verge Common makes that everyday work easier to
              organize.
            </p>
            <p>
              We’re opening the code because communities should be able to
              understand their tools, adapt them, and carry on without depending
              on one company.
            </p>
            <p>
              Our first step is a simple local planner. Our direction is a
              community network shaped by real stewardship work.
            </p>
          </div>
        </section>
        <section className="wrap release">
          <div className="section-head">
            <div>
              <p className="eyebrow">02 / START SMALL</p>
              <h2>A useful first step.</h2>
            </div>
            <span className="pill">COMMUNITY EDITION · v0.1</span>
          </div>
          <div className="three-grid">
            <article>
              <span className="index">01</span>
              <h3>Make a place card</h3>
              <p>
                Give a place a name and a purpose. Use a general area; keep
                exact addresses and sensitive habitat locations out.
              </p>
            </article>
            <article>
              <span className="index">02</span>
              <h3>Plan & record an action</h3>
              <p>
                Choose one task, mark it complete, and keep a short note about
                what you learned.
              </p>
            </article>
            <article>
              <span className="index">03</span>
              <h3>Carry the work forward</h3>
              <p>
                Download your plan or copy an invitation to share yourself.
                Everything stays in your browser until you choose to share it.
              </p>
            </article>
          </div>
          <p className="release-note">
            This edition stores plans on your device. Shared accounts, live
            neighborhood discovery, and verified ecological outcomes are future
            work.
          </p>
        </section>
        <section id="contribute" className="contribute">
          <div className="wrap">
            <p className="eyebrow">03 / BUILD WITH US</p>
            <h2>
              Good ideas should
              <br />
              travel.
            </h2>
            <div className="contribute-bottom">
              <p>
                Try it with a place you care about. Tell us what helped. Improve
                a translation, fix a bug, or help make the tools more
                accessible. You don’t have to write code to contribute.
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
        <span>Open code. Local care.</span>
        <div>
          <a href={`${repo}/blob/main/LICENSE`}>AGPL-3.0</a>
          <a href={`${repo}/blob/main/PRIVACY.md`}>Privacy</a>
          <a href={repo}>GitHub ↗</a>
        </div>
      </footer>
    </>
  );
}
