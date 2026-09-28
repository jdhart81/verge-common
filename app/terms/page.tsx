import type { Metadata } from 'next';
import Link from 'next/link';
import { InformationPage, documentBranch } from '@/components/information-page';

export const metadata: Metadata = {
  title: 'Terms of Use · VergeCommon',
  description:
    'The rules for using the hosted VergeCommon service: accounts, your content, acceptable use, co-op responsibilities and the limits of what the service does.',
};

// Keep in step with TERMS_VERSION in self-hosted/terms.mjs. Changing the
// substance of these terms requires a new version so acceptance is re-recorded.
const EFFECTIVE = 'September 28, 2026';

export default function TermsPage() {
  return (
    <InformationPage
      title="Terms of Use"
      intro="The ground rules for using VergeCommon at vergecommon.com. They are written to be read. Creating an account means you agree to them."
    >
      <p>
        Effective {EFFECTIVE}. VergeCommon is operated by Viridis LLC, a Vermont
        company (“we”). These terms cover the hosted service at vergecommon.com,
        its apps and its agent (MCP) endpoint. The open-source code is licensed
        separately under the <a href={documentBranch + '/LICENSE'}>AGPL-3.0</a>;
        if you run your own copy, these terms do not apply to it.
      </p>

      <section>
        <h2>1. The service is a public beta</h2>
        <p>
          VergeCommon is free to use and still changing. Features may be added,
          changed or removed, and the service may be interrupted. We keep daily
          backups, but keep your own copies of anything important; you can
          download your records at any time from{' '}
          <Link href="/account">Your account</Link>.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>
            You must be at least 18, or the age of majority where you live.
          </li>
          <li>
            One person per account. Do not share an account or create extra
            accounts to get around limits, bans or reviews. Where the service
            asks for a second person to review something, that must be a
            different real person.
          </li>
          <li>
            Keep your password and recovery code safe. We cannot reset a
            password without your recovery code or a linked sign-in method.
          </li>
          <li>
            You are responsible for what happens under your account and for any
            agent or device token you create.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Your content</h2>
        <p>
          You keep ownership of what you post and upload: text, maps, photos,
          files and records. You give us permission to store, copy, display and
          process it only as needed to run the service for the audience you
          choose, such as your co-op’s members or the public directory. This
          permission ends when the content is deleted, except for backup copies
          kept for a limited time and records that our{' '}
          <Link href="/privacy/">Privacy policy</Link> says are retained.
        </p>
        <p>
          Only share what you have the right to share. Get consent before
          recording other people’s personal information or details of land that
          is not yours, and describe land rights and ownership truthfully.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>
          Follow our{' '}
          <a href={documentBranch + '/CODE_OF_CONDUCT.md'}>Code of Conduct</a>.
          Do not:
        </p>
        <ul>
          <li>harass, threaten or discriminate against anyone;</li>
          <li>
            post illegal content, or share someone’s private information or
            precise land locations without their consent;
          </li>
          <li>send spam, run scams, or misrepresent who you are;</li>
          <li>
            upload malware, overload the service, scrape it at abusive rates, or
            work around rate limits and storage limits;
          </li>
          <li>
            probe or test the service’s security except as described in our{' '}
            <a href={documentBranch + '/SECURITY.md'}>security policy</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Co-ops are run by their members</h2>
        <p>
          Each co-op sets its own purpose, rules and decisions, and its stewards
          are responsible for running it. We provide the tools; we are not a
          party to agreements between members, landholders or partners.
          Membership in a co-op on VergeCommon does not by itself create legal,
          property or financial rights.
        </p>
      </section>

      <section>
        <h2>6. What VergeCommon does not do</h2>
        <p>
          VergeCommon does not certify environmental outcomes, issue or sell
          carbon credits, hold money, or make payments. Readiness checklists,
          area estimates, satellite screening and allocation previews are
          planning aids, not verification or professional advice. Get qualified
          legal, financial, surveying and ecological advice before relying on
          them.
        </p>
      </section>

      <section>
        <h2>7. Reports, moderation and suspension</h2>
        <p>
          Anyone can <Link href="/report/">report a problem</Link>. We may
          remove content, restrict features or suspend accounts that break these
          terms or put people or places at risk, and we will explain why where
          we safely can. Co-op stewards also moderate their own communities.
        </p>
      </section>

      <section>
        <h2>8. Ending your use</h2>
        <p>
          You can delete your account at any time from Your account. We may end
          or suspend access for serious or repeated breaches, or if we have to
          stop operating the service. We will try to give notice and time to
          download your records unless that would be unsafe or unlawful.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers and limits of liability</h2>
        <p>
          The service is provided “as is” and “as available”, without warranties
          of any kind, to the extent the law allows. To the extent the law
          allows, Viridis LLC is not liable for indirect, incidental or
          consequential losses, or for lost data, profits or opportunities, and
          our total liability for any claim about the service is limited to US
          $100. Some places do not allow these limits, so they may not all apply
          to you.
        </p>
      </section>

      <section>
        <h2>10. Changes and governing law</h2>
        <p>
          If we change these terms in a meaningful way, we will post the new
          version here with a new effective date and show a notice on the site
          at least 14 days before it applies. Continuing to use the service
          after that means you accept the new version. These terms are governed
          by the laws of the State of Vermont, USA.
        </p>
      </section>

      <section id="contact">
        <h2>11. Contact</h2>
        <p>
          Questions about these terms:{' '}
          <a href="mailto:justin@viridisconservation.com">
            justin@viridisconservation.com
          </a>
          . For help using the service, see{' '}
          <Link href="/support/">Get help</Link>.
        </p>
      </section>
    </InformationPage>
  );
}
