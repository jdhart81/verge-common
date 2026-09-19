import type { Metadata } from 'next';
import Link from 'next/link';
import {
  InformationPage,
  documentBranch,
  accountRoutes,
} from '@/components/information-page';
import { projectSupport } from '@/lib/project-support';

export const metadata: Metadata = {
  title: 'Privacy and visibility · VergeCommon',
  description:
    'How VergeCommon handles account information, shared conservation records, visibility and account deletion.',
};

export default function PrivacyPage() {
  return (
    <InformationPage
      title="Privacy, with clear boundaries."
      intro="Understand what your co-op shares, what stays private, and what happens when you leave. VergeCommon is operated by Viridis LLC."
    >
      <p>
        Updated September 19, 2026. This page summarizes the hosted public beta.
        The{' '}
        <a href={documentBranch + '/PRIVACY.md'}>
          full privacy and visibility policy
        </a>{' '}
        also describes the alternate hosting and field-processing tools.
      </p>
      <section>
        <h2>Your account and access</h2>
        <p>
          We store your chosen username and display name, a salted password
          hash, and a hashed recovery code. No email address is required to
          join. Sessions and optional device or agent tokens are stored as
          hashes with expiry and revocation. Security events record the account
          ID, action and time without including your password, recovery code or
          token.
        </p>
        <p>
          The hosted service keeps co-op records in a private database and
          uploaded evidence on its dedicated server. Operators manage that
          server and its backups. The host may process request metadata such as
          IP addresses. VergeCommon includes no advertising or application
          analytics tracker.
        </p>
      </section>
      <section>
        <h2>Who can see your records</h2>
        <ul>
          <li>
            <strong>Public visitors:</strong> a co-op’s introduction, general
            region, active member count, and projects, updates and event
            summaries that have been explicitly made public. Public discovery
            does not expose exact land references, agreements, evidence, member
            identities, votes or financial records.
          </li>
          <li>
            <strong>Active members:</strong> their co-op’s projects,
            discussions, governance and financial records. Exact event
            instructions stay member-only. Organizers and stewards see RSVP
            names; other members see their own response and a total.
          </li>
          <li>
            <strong>Submitters and stewards:</strong> parcel boundaries,
            agreements, field evidence, imagery jobs and results. Evidence
            downloads require the uploader or an active steward. Choose stewards
            you trust with sensitive material.
          </li>
        </ul>
        <p>
          Organization profiles are self-reported. Public descriptions must not
          contain private addresses, sensitive habitat locations, personal
          information or confidential evidence. The software cannot establish
          that you have someone else’s consent to publish.
        </p>
      </section>
      <section>
        <h2>Reports, blocking and stewardship</h2>
        <p>
          The separate operator report form stores your description, category,
          referenced item and review status privately on the hosting server.
          A signed-in browser report is associated with your account and removed
          when that account is deleted. Reports sent without sign-in are linked
          only to a private receipt; contact the operator with that receipt for
          a privacy request. No email address is required. The receipt reveals
          status only, not report text. Operator decisions are recorded separately
          for accountability; reports and decisions also follow backup retention.
        </p>
        <p>
          Reports are visible to the reporting member and co-op stewards. Hidden
          content stays in moderation records; hiding is not deletion. Your
          personal block list is visible only to you. Blocking hides social
          updates, replies and events between the two members within that co-op,
          while shared governance records and public pages remain visible.
          Stewards retain access to moderation material.
        </p>
        <p>
          Transferring a co-op’s founder responsibility changes application
          administration. It does not transfer land rights, legal authority or
          financial records.
        </p>
      </section>
      <section>
        <h2>Maps, links and local tools</h2>
        <p>
          The optional background map contacts OpenFreeMap only after you choose
          to load it. The provider receives your IP address and tile requests
          revealing the viewed area; parcel overlays are drawn locally. Device
          location is requested only when you choose the location control.
        </p>
        <p>
          Satellite catalogue searches separately require confirmation before
          sending a parcel’s bounding box and a date window to Copernicus Data
          Space. Member identities, land references and consent documents are
          not sent. Revoking permission stops future searches for that boundary
          version but cannot erase previous requests to a provider.
        </p>
        <p>
          The local planner keeps its plan in browser storage. The hypothetical
          co-op calculator keeps scenarios in page memory until exported.
          Neither writes to the shared co-op ledger. Downloads can contain
          private records; store and share them carefully. External links,
          GitHub and payment providers have their own privacy policies.
        </p>
      </section>
      <section id="your-choices">
        <h2>Your choices and account deletion</h2>
        <p>
          From <a href={accountRoutes.account}>Your account</a>, you can export
          records available to you, change your password, revoke connected
          devices or agents, and{' '}
          <a href={accountRoutes.close}>permanently delete your account</a>.
          Deletion revokes access and removes your authored personal content,
          private land records, associated evidence and uploaded files. The
          native app also offers account deletion. It has a separate control for
          deleting journal drafts stored on your device.
        </p>
        <p>
          Transfer founder responsibility from the co-op’s Members area before
          deleting a founder account when other active members remain. Shared
          numeric and governance structures may remain with account identities
          and attributable text removed; related financial recording is paused
          when necessary identifiers have been erased. Other members’ own text
          and copies already downloaded by others cannot be automatically
          removed by this action. Contact us if those records identify you.
        </p>
        <p>
          A minimal private deletion receipt keeps an opaque account identifier
          and time so restoring an older backup does not restore deleted account
          data. Existing backups are not instantly rewritten; any restoration
          must apply the current deletion ledger before the service reopens.
          Operators control backup access and retention. Removing a member or
          archiving a co-op is separate from deleting an account.
        </p>
        <p>
          {projectSupport.contactEmail ? (
            <>
              For account, privacy or record-removal requests, contact{' '}
              <a href={`mailto:${projectSupport.contactEmail}`}>
                {projectSupport.contactEmail}
              </a>
              . Do not include passwords or recovery codes.
            </>
          ) : (
            <>
              A private operator contact is being finalized. Keep beta records
              nonsensitive while this support route is pending.{' '}
              <Link href="/support/">See the current help options.</Link>
            </>
          )}
        </p>
      </section>
    </InformationPage>
  );
}
