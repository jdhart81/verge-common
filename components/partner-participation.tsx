'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ControlLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type ParticipationPartner = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  website: string;
  status: string;
  participationStatus?: string;
  representative?: {
    id: string;
    memberId: string;
    status: string;
    expiresAt: number;
    roleTitle?: string;
    authorityReference?: string;
    reviewNote?: string;
    endReason?: string;
    isRepresentative: boolean;
    canReview: boolean;
  } | null;
  authorityEvidence?: { id: string; title: string }[];
  eligibleRepresentatives?: { id: string; name: string }[];
};
const labels: Record<string, string> = {
  not_invited: 'No representative invited',
  invited: 'Waiting for the representative',
  accepted: 'Accepted — authority review needed',
  reviewed: 'Participation and authority evidence reviewed by the co-op',
  declined: 'Invitation declined',
  rejected: 'Authority review declined',
  ended: 'Participation ended',
  expired: 'Invitation expired',
  member_inactive: 'Representative no longer has active membership',
  evidence_needed: 'Supporting authority evidence needs review',
  needs_new_invitation: 'Partnership changed — a new invitation is needed',
};
type Props = {
  records: ParticipationPartner[];
  steward: boolean;
  disabled: boolean;
  growthPaused?: boolean;
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  mutate: (op: string, payload: Record<string, string>) => Promise<boolean>;
};
function ParticipationForm({
  action,
  label,
  disabled,
  children,
}: {
  action: (values: Record<string, string>) => Promise<boolean>;
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="action-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form)) as Record<
          string,
          string
        >;
        setBusy(true);
        setError('');
        try {
          if (await action(data)) form.reset();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not save. Refresh and try again.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={disabled || busy} className="grid gap-3">
        {children}
        <Button type="submit">{busy ? 'Saving…' : label}</Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function PartnerParticipation({
  records,
  steward,
  disabled,
  growthPaused,
  members,
  projects,
  mutate,
}: Props) {
  if (!records.length) return null;
  return (
    <section className="my-6" aria-label="Partner representatives">
      <h2>Work with a partner representative</h2>
      <p>
        Invite the organization’s contact to join this co-op first. After their
        membership is approved, a steward can invite them to confirm
        participation in a reviewed partnership below. No invitations or
        messages are sent automatically.
      </p>
      <p className="small">
        This records participation in the software. It does not sign an
        agreement, grant additional access, verify nonprofit status or establish
        legal authority. A different steward reviews the representative’s own
        supporting evidence.
      </p>
      {records.map((partner) => {
        const rep = partner.representative,
          status = partner.participationStatus ?? 'not_invited';
        const closed = [
          'not_invited',
          'declined',
          'rejected',
          'ended',
          'expired',
        ].includes(status);
        const act = (op: string, values: Record<string, string>) =>
          mutate(op, {
            ...values,
            id: partner.id,
            ...(rep ? { invitationId: rep.id } : {}),
          });
        return (
          <article className="network-card" key={partner.id}>
            <h3>{partner.name} — participation</h3>
            <p>
              Project:{' '}
              {projects.find((p) => p.id === partner.projectId)?.name ??
                'Project unavailable'}
            </p>
            <a href={partner.website} target="_blank" rel="noreferrer">
              Partner website ↗
            </a>
            <p>{partner.role}</p>
            <output className="block">{labels[status] ?? status}</output>
            {rep && (
              <>
                <p>
                  Representative:{' '}
                  {members.find((m) => m.id === rep.memberId)?.name ??
                    'Former member'}
                  {rep.roleTitle ? ` · ${rep.roleTitle}` : ''}
                </p>
                {rep.authorityReference && (
                  <p>Authority reference: {rep.authorityReference}</p>
                )}
                {rep.reviewNote && <p>Review note: {rep.reviewNote}</p>}
                {rep.endReason && <p>Reason ended: {rep.endReason}</p>}
              </>
            )}
            {steward && closed && partner.status === 'reviewed' && (
              <ParticipationForm
                disabled={disabled || !!growthPaused}
                label="Invite this representative"
                action={(v) => act('invite_partner_representative', v)}
              >
                <ControlLabel>
                  Partner representative
                  <select name="memberId" required defaultValue="">
                    <option value="" disabled>
                      Choose an approved member
                    </option>
                    {(partner.eligibleRepresentatives ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </ControlLabel>
                <p className="small">
                  This shares the partner’s name, website and agreed role with
                  the selected member. Private agreement files and other
                  members’ evidence stay protected. The invitation expires after
                  seven days.
                </p>
              </ParticipationForm>
            )}
            {rep?.isRepresentative && status === 'invited' && (
              <>
                <ParticipationForm
                  disabled={disabled || !!growthPaused}
                  label="Confirm my participation"
                  action={(v) =>
                    act('respond_partner_invitation', {
                      ...v,
                      decision: 'accept',
                    })
                  }
                >
                  <ControlLabel>
                    Your role at this organization
                    <Input name="roleTitle" maxLength={120} required />
                  </ControlLabel>
                  <ControlLabel>
                    Reference supporting your authority
                    <Textarea
                      name="authorityReference"
                      maxLength={500}
                      required
                    />
                  </ControlLabel>
                  <p className="small">
                    Confirming records your willingness to work with this co-op
                    in the stated role. It does not sign the partnership
                    agreement. Next, submit your authority evidence in Evidence
                    for an independent steward’s review.
                  </p>
                </ParticipationForm>
                <ParticipationForm
                  disabled={disabled}
                  label="Decline invitation"
                  action={() =>
                    act('respond_partner_invitation', { decision: 'decline' })
                  }
                >
                  <p>You can decline without providing a reason.</p>
                </ParticipationForm>
              </>
            )}
            {rep?.isRepresentative && status === 'accepted' && (
              <p className="notice">
                Submit evidence of your authority for this project in Evidence.
                Another steward must review that evidence and this participation
                record.
              </p>
            )}
            {steward && rep?.canReview && status === 'accepted' && (
              <ParticipationForm
                disabled={disabled || !!growthPaused}
                label="Save representative review"
                action={(v) => act('review_partner_representative', v)}
              >
                <ControlLabel>
                  Decision
                  <select name="decision" defaultValue="approve">
                    <option value="approve">Approve the co-op review</option>
                    <option value="reject">Decline the co-op review</option>
                  </select>
                </ControlLabel>
                <ControlLabel>
                  Reviewed authority evidence
                  <select name="evidenceId" defaultValue="">
                    <option value="">Choose evidence to approve</option>
                    {(partner.authorityEvidence ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </ControlLabel>
                <ControlLabel>
                  How the authority was checked
                  <Textarea name="note" maxLength={1000} required />
                </ControlLabel>
                <p className="small">
                  Only reviewed evidence submitted by this representative for
                  this project can support approval. Check the organization
                  through its official channels; the software cannot verify
                  those facts for you.
                </p>
              </ParticipationForm>
            )}
            {rep &&
              (steward || rep.isRepresentative) &&
              !['ended', 'declined', 'rejected'].includes(rep.status) && (
                <details className="mt-4">
                  <summary>End or replace participation</summary>
                  <ParticipationForm
                    disabled={disabled}
                    label="End participation"
                    action={(v) => act('end_partner_participation', v)}
                  >
                    <ControlLabel>
                      Reason
                      <Textarea name="reason" maxLength={1000} required />
                    </ControlLabel>
                    <p className="small">
                      This ends the software participation record. It does not
                      cancel an external agreement or remove co-op membership.
                    </p>
                  </ParticipationForm>
                </details>
              )}
          </article>
        );
      })}
    </section>
  );
}
