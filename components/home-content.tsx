import { UpdatesLink } from '@/components/updates-link';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Code2,
  MapPin,
  Users,
  BookOpen,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { ConservationLandscape } from '@/components/conservation-landscape';
import '../app/home.css';
import { getHomeStrings, type HomeLocale } from '@/lib/i18n/home';

const repo = 'https://github.com/jdhart81/verge-common';
const sourceRepo = repo;
const docs = repo + '/blob/main';

export function HomeContent({
  publicPreview = false,
  locale = 'en',
}: { publicPreview?: boolean; locale?: HomeLocale } = {}) {
  const t = getHomeStrings(locale);
  const startLink = publicPreview
    ? '/demo/'
    : '/account?mode=register&returnTo=%2Fworkspace%2F';
  return (
    <div className="mission-home" lang={locale}>
      <a className="skip" href="#main">
        {t.skipToContent}
      </a>
      <header className="nav home-nav">
        <Link className="brand" href="/" aria-label={t.brandHomeLabel}>
          <BrandLogo />
        </Link>
        <nav aria-label={t.mainNavigation}>
          <a className="home-how-link" href="#how-it-works">
            {t.howItWorks}
          </a>
          <Link href={publicPreview ? '/demo/' : '/network/'}>
            {publicPreview ? t.tryPlanner : t.findCoop}
          </Link>
          <a
            className="home-signin"
            href={publicPreview ? '#contribute' : '/account'}
          >
            {publicPreview ? t.contribute : t.signIn}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero wrap home-hero" aria-labelledby="home-title">
          <div className="hero-grid">
            <div className="home-hero-copy">
              <p className="eyebrow">
                <span className="signal" aria-hidden="true" /> {t.heroEyebrow}
              </p>
              <h1 id="home-title">
                {t.heroTitleFirst}
                <br />
                {t.heroTitleSecond}{' '}<em>{t.heroTitleEmphasis}</em>
              </h1>
              <p className="intro">
                {t.heroIntroFirst}
                <br />
                {t.heroIntroSecond}
              </p>
              <div className="actions">
                <a className="button primary" href={startLink}>
                  {publicPreview ? t.planFirstProject : t.startCoop}
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
                <Link
                  className="text-link"
                  href={publicPreview ? '#how-it-works' : '/network/'}
                >
                  {publicPreview ? t.seeHowItWorks : t.exploreCommunity}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              </div>
              <p className="home-try">
                {t.justLooking}{' '}
                <Link href="/demo/">{t.tryWithoutAccount}</Link>
              </p>
              <p className="fine home-pilot">
                <span aria-hidden="true" />{' '}
                {publicPreview
                  ? t.contributorPreview
                  : t.publicBeta}
              </p>
            </div>
            <ConservationLandscape locale={locale} />
          </div>
        </section>
        <div className="home-principles">
          <div className="wrap">
            <span>
              <Users size={18} aria-hidden="true" /> {t.communityLed}
            </span>
            <span>
              <ShieldCheck size={18} aria-hidden="true" /> {t.privateRecords}
            </span>
            <a href={sourceRepo}>
              <Code2 size={18} aria-hidden="true" /> {t.openCode}
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
              <p className="eyebrow">{t.stepsEyebrow}</p>
              <h2 id="how-title">
                {t.stepsTitleFirst}
                <br />
                <em>{t.stepsTitleSecond}</em>
              </h2>
            </div>
            <p>
              {t.stepsIntro}
            </p>
          </div>
          <ol className="home-steps">
            <li>
              <div className="home-step-top">
                <span>01</span>
                <Users aria-hidden="true" />
              </div>
              <h3>{t.stepOneTitle}</h3>
              <p>
                {t.stepOneDescription}
              </p>
            </li>
            <li>
              <div className="home-step-top">
                <span>02</span>
                <MapPin aria-hidden="true" />
              </div>
              <h3>{t.stepTwoTitle}</h3>
              <p>
                {t.stepTwoDescription}
              </p>
            </li>
            <li>
              <div className="home-step-top">
                <span>03</span>
                <BookOpen aria-hidden="true" />
              </div>
              <h3>{t.stepThreeTitle}</h3>
              <p>
                {t.stepThreeDescription}
              </p>
            </li>
          </ol>
        </section>
        <section className="home-common-ground" aria-labelledby="common-title">
          <div className="wrap home-common-grid">
            <div>
              <p className="eyebrow">{t.commonEyebrow}</p>
              <h2 id="common-title">
                {t.commonTitleFirst}
                <br />
                <em>{t.commonTitleSecond}</em>
              </h2>
              <p>
                {t.commonIntro}
              </p>
              <Link
                className="text-link"
                href={publicPreview ? '/demo/' : '/network/'}
              >
                {publicPreview
                  ? t.tryLocalPlanner
                  : t.findCommonGround}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <dl className="home-tools">
              <div>
                <dt>
                  <Users size={21} aria-hidden="true" /> {t.conversationTitle}
                </dt>
                <dd>
                  {t.conversationDescription}
                </dd>
              </div>
              <div>
                <dt>
                  <ShieldCheck size={21} aria-hidden="true" /> {t.shareTitle}
                </dt>
                <dd>
                  {t.shareDescription}
                </dd>
              </div>
              <div>
                <dt>
                  <BookOpen size={21} aria-hidden="true" /> {t.decideTitle}
                </dt>
                <dd>
                  {t.decideDescription}
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
            <p className="eyebrow">{t.questionsEyebrow}</p>
            <h2 id="questions-title">
              {t.questionsTitleFirst}
              <br />
              {t.questionsTitleSecond}
            </h2>
            <p>
              {t.questionsIntro}
            </p>
          </div>
          <div className="home-faq">
            <details>
              <summary>
                {t.landQuestion}
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {t.landAnswer}
              </p>
            </details>
            <details>
              <summary>
                {t.poolingQuestion}
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {t.poolingAnswer}
              </p>
            </details>
            <details>
              <summary>
                {t.nonprofitQuestion}
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {t.nonprofitAnswer}
              </p>
            </details>
            <details>
              <summary>
                {t.carbonQuestion}
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {t.carbonAnswer}
              </p>
            </details>
            <details>
              <summary>
                {t.availableQuestion}
                <Plus size={20} aria-hidden="true" />
              </summary>
              <p>
                {publicPreview ? t.availableIntroPreview : t.availableIntroHosted}{' '}
                {t.availableCapabilities}{' '}
                {publicPreview ? t.availableOutroPreview : t.availableOutroHosted}{' '}
                <a href={docs + '/docs/FEATURE_ACCEPTANCE.md'}>
                  {t.featureStatusLink}
                </a>
              </p>
            </details>
            {!publicPreview && (
              <details>
                <summary>
                  {t.betaQuestion}
                  <Plus size={20} aria-hidden="true" />
                </summary>
                <p>
                  {t.betaAnswer}{' '}
                  <Link href="/support/">{t.helpAndReporting}</Link>
                </p>
              </details>
            )}
          </div>
        </section>
        {!publicPreview && (
          <section
            className="wrap home-funding"
            aria-labelledby="funding-title"
          >
            <div>
              <p className="eyebrow">{t.fundingEyebrow}</p>
              <h2 id="funding-title">{t.fundingTitle}</h2>
              <p>
                {t.fundingDescription}
              </p>
            </div>
            <Link className="button home-funding-link" href="/support-project/">
              {t.supportProject}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>
        )}
        <section
          id="contribute"
          className="home-invitation"
          aria-labelledby="join-title"
        >
          <div className="wrap">
            <p className="eyebrow">{t.invitationEyebrow}</p>
            <h2 id="join-title">
              {t.invitationTitleFirst}
              <br />
              <em>{t.invitationTitleSecond}</em>
            </h2>
            <div className="home-invitation-bottom">
              <p>
                {t.invitationDescription}
              </p>
              <a className="button primary" href={startLink}>
                {publicPreview ? t.startLocalPlan : t.startCommunity}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
            <div className="home-contributor">
              <span>
                {t.contributorMessage}
              </span>
              <a href={docs + '/CONTRIBUTING.md'}>
                {t.contributeToVergeCommon}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="wrap footer home-footer">
        <Link className="brand" href="/">
          <BrandLogo />
        </Link>
        <span>{t.footerTagline}</span>
        {!publicPreview ? <UpdatesLink label={t.getUpdates} /> : null}
        <div>
          <a href={docs + '/LICENSE'}>AGPL-3.0</a>
          <a
            href={
              publicPreview ? 'https://vergecommon.com/privacy/' : '/privacy/'
            }
          >
            {t.privacy}
          </a>
          <a
            href={publicPreview ? 'https://vergecommon.com/terms/' : '/terms/'}
          >
            {t.terms}
          </a>
          <a
            href={
              publicPreview ? 'https://vergecommon.com/support/' : '/support/'
            }
          >
            {t.getHelp}
          </a>
          <a
            href={
              publicPreview ? 'https://vergecommon.com/woodland/' : '/woodland/'
            }
          >
            {t.woodlandCorridors}
          </a>
          <a href={sourceRepo}>
            {t.source}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
