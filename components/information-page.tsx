import Link from 'next/link';
import { ArrowUpRight, Sprout } from 'lucide-react';
import type { ReactNode } from 'react';
import './information-page.css';

export const sourceBranch =
  'https://github.com/jdhart81/verge-common/tree/build/coop-launch-readiness';
export const documentBranch =
  'https://github.com/jdhart81/verge-common/blob/build/coop-launch-readiness';
// Account pages are rendered by the hosting gateway, so use document navigation.
export const accountRoutes = {
  account: '/account',
  recover: '/account?mode=recover',
  register: '/account?mode=register&returnTo=%2Fworkspace%2F',
  close: '/account#close-account',
};

export function InformationPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="information-page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav information-nav">
        <Link className="brand" href="/" aria-label="VergeCommon home">
          <Sprout aria-hidden="true" />
          <span>verge common</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/network/">Find a co-op</Link>
          <a href={accountRoutes.account}>
            Your account <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main" className="wrap information-main">
        <p className="eyebrow">VERGECOMMON / PUBLIC BETA</p>
        <h1>{title}</h1>
        <p className="information-intro">{intro}</p>
        <div className="information-content">{children}</div>
      </main>
      <footer className="wrap footer information-footer">
        <span>A Viridis LLC project. Open code. Cooperative conservation.</span>
        <nav aria-label="Help and project information">
          <Link href="/privacy/">Privacy</Link>
          <Link href="/support/">Get help</Link>
          <Link href="/support-project/">Support the project</Link>
          <a href={sourceBranch}>
            Source <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </footer>
    </div>
  );
}
