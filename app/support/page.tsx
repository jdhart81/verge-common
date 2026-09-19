import type { Metadata } from 'next';
import Link from 'next/link';
import {
  InformationPage,
  documentBranch,
  accountRoutes,
} from '@/components/information-page';
import { projectSupport } from '@/lib/project-support';

export const metadata: Metadata = {
  title: 'Help and support · VergeCommon',
  description:
    'Help with account recovery, membership, safety reports, privacy and the VergeCommon public beta.',
};

export default function SupportPage() {
  return (
    <InformationPage
      title="A little help on common ground."
      intro="Start here for account access, co-op membership and safer participation in the public beta."
    >
      <aside className="notice">
        VergeCommon is a public beta. Features may change, and support is
        handled by a small project team. Keep copies of important records and
        use nonsensitive examples when testing.
      </aside>
      <section id="account-help">
        <h2>Get back into your account</h2>
        <p>
          <a href={accountRoutes.recover}>Use your saved recovery code</a> with
          your username to set a new password. Save the replacement recovery
          code shown after the reset: the previous code no longer works.
          VergeCommon does not collect an email address at signup or send
          password-reset emails.
        </p>
        <p>
          Never share your password, recovery code or device token in a support
          message. If you lost a device, sign in on another device and revoke
          its token under <strong>Devices and agents</strong>. Tokens expire
          after 90 days; create a replacement if a connected app reports that
          access has expired.
        </p>
      </section>
      <section>
        <h2>Join a co-op</h2>
        <p>
          An invitation lets you request membership. A steward must approve your
          request before you can view private co-op records. If a link expired
          or has already been used, ask the person who invited you for a new
          one. Share invitation links privately.
        </p>
        <p>
          To start your own group,{' '}
          <a href={accountRoutes.register}>create an account</a>, open your
          co-ops, and create a workspace. Start with a general location and a
          small project you can work on together.
        </p>
      </section>
      <section id="community-safety">
        <h2>Report a concern or block a member</h2>
        <p>
          Use <strong>Report a concern</strong> on an update, reply or event to
          send a report to the co-op’s stewards. Report harmful content before
          blocking so stewards can review the relevant material. Reports stay
          within that co-op.
        </p>
        <p>
          In <strong>Members</strong>, choose <strong>Block member</strong> to
          hide social updates, replies and events between you and that member in
          the co-op. You can undo it from the same area. Blocking does not hide
          shared governance records or public pages, and stewards retain the
          material needed for moderation.
        </p>
        <p>
          Co-op stewards handle their community’s reports. For a concern
          involving the hosting service or an unresolved safety issue, use the
          <Link href="/report/">private operator report form</Link> and keep
          its receipt to check progress, or use the contact below. This service is not an emergency
          response channel.
        </p>
      </section>
      <section id="contact">
        <h2>Contact the project</h2>
        {projectSupport.contactEmail ? (
          <p>
            VergeCommon is operated by {projectSupport.operator}. For private
            account, privacy or safety support, email{' '}
            <a href={`mailto:${projectSupport.contactEmail}`}>
              {projectSupport.contactEmail}
            </a>
            . Include the page or action involved and a brief description. Leave
            out passwords, access tokens, recovery codes and private land
            evidence.
          </p>
        ) : (
          <p>
            VergeCommon is operated by {projectSupport.operator}. A private
            operator contact is being finalized. Until that route is available,
            keep beta records nonsensitive. Do not post private account or land
            information to a public issue.
          </p>
        )}
        <ul>
          <li>
            <a href="https://github.com/jdhart81/verge-common/issues/new/choose">
              Report a nonprivate bug or suggest an improvement
            </a>{' '}
            on GitHub. Issues are public. Include steps to reproduce the
            problem, your browser or app version, and a screenshot only after
            removing personal information.
          </li>
          <li>
            <a href="https://github.com/jdhart81/verge-common/security/advisories/new">
              Report a security vulnerability privately
            </a>{' '}
            through GitHub’s security advisory form. A GitHub account is
            required. Read the{' '}
            <a href={documentBranch + '/SECURITY.md'}>
              security reporting policy
            </a>{' '}
            first.
          </li>
        </ul>
      </section>
      <section>
        <h2>Export records or delete your account</h2>
        <p>
          <a href={accountRoutes.account}>Your account</a> includes an export of
          records you can access and a{' '}
          <a href={accountRoutes.close}>permanent account deletion option</a>.
          Deletion removes your authored personal content and revokes access;
          shared numeric and governance structures may remain without your
          account identity. If you founded a co-op with other active members,
          first transfer responsibility to another active steward in{' '}
          <strong>Members</strong>. That transfers app administration only. The
          native app also offers account deletion and a separate control for
          clearing its on-device journal.
        </p>
        <p>
          <Link href="/privacy/">Read about privacy and record retention</Link>{' '}
          before uploading evidence or asking to remove a shared record.
        </p>
      </section>
      <section>
        <h2>Help the project grow</h2>
        <p>
          Field experience, accessibility feedback, documentation and code all
          help improve VergeCommon.{' '}
          <Link href="/support-project/">See ways to support the project</Link>.
        </p>
      </section>
    </InformationPage>
  );
}
