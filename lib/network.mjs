import { validateBoundary } from './monitoring.mjs';
import { currencies } from './international.mjs';
// Shared domain rules. Every command is applied to a copy and saved atomically.
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status = 400) => {
  throw new DomainError(message, status);
};
const required = (value, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`Enter text between 1 and ${max} characters.`);
  return value.trim();
};
const optional = (value, max = 2000) =>
  value === undefined || value === '' ? '' : required(value, max);
const integer = (v, max = 1e12) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    fail(`Enter a whole number between 0 and ${max}.`);
  return v;
};
const choose = (v, options) => {
  if (!options.includes(v)) fail('Unsupported option.');
  return v;
};
const find = (items, id) =>
  items.find((x) => x.id === id) ?? fail('Record not found.', 404);
export function membership(state, userId) {
  return state.members.find(
    (m) => m.userId === userId && m.status === 'active',
  );
}
export function isSteward(state, userId) {
  return membership(state, userId)?.role === 'steward';
}
export function requireMember(state, userId) {
  return (
    membership(state, userId) ??
    fail('Active co-op membership is required.', 403)
  );
}
export function requireSteward(state, userId) {
  if (!isSteward(state, userId))
    fail('A co-op steward must perform this action.', 403);
}
export function newWorkspace(input, user, now, id) {
  return {
    id,
    name: required(input.name, 120),
    region: required(input.region, 120),
    summary: required(input.summary, 1000),
    visibility: 'private',
    country: optional(input.country, 120),
    currency: choose(input.currency ?? 'USD', currencies),
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
    members: [
      {
        id: crypto.randomUUID(),
        userId: user.id,
        name: required(input.displayName, 80),
        role: 'steward',
        status: 'active',
        joinedAt: now,
      },
    ],
    organization: null,
    invitations: [],
    assessments: [],
    authority: null,
    parcels: [],
    satelliteSearches: [],
    observations: [],
    projects: [],
    updates: [],
    events: [],
    comments: [],
    reports: [],
    tasks: [],
    agreements: [],
    evidence: [],
    proposals: [],
    charters: [],
    lots: [],
    settlements: [],
    allocations: [],
    retirements: [],
    audit: [],
  };
}
export function allocateCents(total, members, stewardshipBps, treasuryBps) {
  integer(total);
  integer(stewardshipBps, 10000);
  integer(treasuryBps, 10000);
  if (stewardshipBps + treasuryBps > 10000)
    fail('Co-op budgets cannot exceed 100%.');
  if (
    !members.length ||
    new Set(members.map((m) => m.id)).size !== members.length
  )
    fail('Use unique member IDs.');
  if (members.reduce((s, m) => s + integer(m.shareBps, 10000), 0) !== 10000)
    fail('Member shares must total 100%.');
  const gross = BigInt(total),
    base = 10000n;
  const stewardship = Number((gross * BigInt(stewardshipBps)) / base),
    treasury = Number((gross * BigInt(treasuryBps)) / base),
    pool = total - stewardship - treasury;
  const rows = members.map((m) => ({
    id: m.id,
    name: m.name,
    cents: Number((BigInt(pool) * BigInt(m.shareBps)) / base),
    r: (BigInt(pool) * BigInt(m.shareBps)) % base,
  }));
  rows.sort((a, b) =>
    a.r === b.r ? (a.id < b.id ? -1 : 1) : a.r > b.r ? -1 : 1,
  );
  let left = pool - rows.reduce((s, m) => s + m.cents, 0);
  for (const m of rows) {
    if (left > 0) {
      m.cents++;
      left--;
    }
  }
  return {
    grossCents: total,
    stewardshipCents: stewardship,
    treasuryCents: treasury,
    memberPoolCents: pool,
    platformCutCents: 0,
    members: rows.map(({ r, ...m }) => m),
  };
}
function approvedEvidence(s, id, projectId = undefined) {
  const e = find(s.evidence, id);
  if (projectId && e.projectId !== projectId)
    fail('The evidence must belong to this project.');
  if (e.status !== 'reviewed') fail('Select independently reviewed evidence.');
  return e;
}
function review(record, userId, decision, now) {
  if (record.status !== 'submitted')
    fail('This record has already been reviewed.');
  if (record.createdBy === userId)
    fail('Another steward must review this record.', 403);
  record.status = decision === 'approve' ? 'reviewed' : 'rejected';
  record.reviewedBy = userId;
  record.reviewedAt = now;
}
function safeLink(value) {
  if (!value) return '';
  let u;
  try {
    u = new URL(value);
  } catch {
    fail('Enter a complete HTTPS reference.');
  }
  if (u.protocol !== 'https:' || u.username || u.password)
    fail('Use an HTTPS reference without credentials.');
  return u.href;
}
export function applyCommand(
  previous,
  user,
  input,
  now = Date.now(),
  id = crypto.randomUUID(),
) {
  const s = structuredClone(previous),
    op = required(input.op, 50),
    p = input.payload ?? {};
  if (s.visibility === 'archived') fail('This co-op is archived.');
  if (op === 'request_membership' || op === 'accept_invitation') {
    if (op === 'accept_invitation') {
      const invitation = (s.invitations ?? []).find(
        (i) => i.tokenHash === p.tokenHash,
      );
      if (
        !invitation ||
        invitation.revoked ||
        invitation.expiresAt <= now ||
        invitation.usedBy
      )
        fail('This invitation is unavailable or expired.', 403);
      invitation.usedBy = user.id;
      invitation.usedAt = now;
    }
    if (op === 'request_membership' && s.visibility !== 'public')
      fail('This co-op is not accepting public membership requests.', 403);
    if (s.members.some((m) => m.userId === user.id))
      fail('You already have a membership or request.');
    if (s.members.length >= 500)
      fail('This pilot co-op has reached its member limit.');
    s.members.push({
      id,
      userId: user.id,
      name: required(p.name, 80),
      role: 'member',
      status: 'pending',
      joinedAt: now,
    });
  } else {
    const member = requireMember(s, user.id);
    switch (op) {
      case 'create_invitation': {
        requireSteward(s, user.id);
        s.invitations ??= [];
        if (s.invitations.length >= 200) fail('Invitation limit reached.');
        if (!/^[a-f0-9]{64}$/.test(p.tokenHash ?? ''))
          fail('Invalid invitation.');
        s.invitations.push({
          id,
          label: required(p.label, 120),
          tokenHash: p.tokenHash,
          expiresAt: now + 7 * 86400000,
          createdAt: now,
          revoked: false,
        });
        break;
      }
      case 'revoke_invitation':
        requireSteward(s, user.id);
        find(s.invitations ?? [], p.id).revoked = true;
        break;
      case 'update_organization':
        requireSteward(s, user.id);
        s.organization = {
          name: required(p.name, 160),
          kind: choose(p.kind, ['nonprofit', 'land_trust', 'community_group']),
          website: safeLink(required(p.website, 500)),
          region: required(p.region, 120),
          services: required(p.services, 1000),
          visibility: choose(p.visibility, ['members', 'public']),
          relationship: 'self_reported',
          updatedAt: now,
        };
        break;
      case 'record_assessment': {
        requireSteward(s, user.id);
        find(s.projects, p.projectId);
        const parcels = s.parcels.filter(
          (x) => x.projectId === p.projectId && x.status === 'reviewed',
        );
        if (!parcels.length)
          fail('Have another steward review at least one parcel first.');
        s.assessments ??= [];
        s.assessments.push({
          id,
          projectId: p.projectId,
          program: required(p.program, 200),
          methodology: required(p.methodology, 200),
          source: safeLink(required(p.source, 500)),
          minimumSquareMetres: integer(p.minimumSquareMetres),
          parcelIds: parcels.map((x) => x.id),
          areaSquareMetres: parcels.reduce((n, x) => n + x.areaSquareMetres, 0),
          criteria: required(p.criteria, 4000),
          gaps: required(p.gaps, 4000),
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_assessment':
        requireSteward(s, user.id);
        review(
          find(s.assessments ?? [], p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      case 'update_regional_settings':
        requireSteward(s, user.id);
        if (s.settlements.length && p.currency !== (s.currency ?? 'USD'))
          fail(
            'Currency is locked after the first settlement to preserve existing amounts.',
          );
        s.currency = choose(p.currency, currencies);
        s.country = required(p.country, 120);
        break;
      case 'update_coop':
        requireSteward(s, user.id);
        s.name = required(p.name, 120);
        s.region = required(p.region, 120);
        s.summary = required(p.summary, 1000);
        s.visibility = choose(p.visibility, ['private', 'public']);
        break;
      case 'member_status': {
        requireSteward(s, user.id);
        const m = find(s.members, p.id);
        if (m.userId === s.ownerId)
          fail('The founding steward cannot be removed.');
        const status = choose(p.status, ['active', 'rejected', 'removed']);
        if (m.role === 'steward' && user.id !== s.ownerId)
          fail('Only the founding steward can remove another steward.', 403);
        m.status = status;
        break;
      }
      case 'member_role': {
        if (user.id !== s.ownerId)
          fail('Only the founding steward manages steward roles.', 403);
        const m = find(s.members, p.id);
        if (m.userId === s.ownerId)
          fail('The founding steward must remain a steward.');
        if (m.status !== 'active') fail('Activate this membership first.');
        m.role = choose(p.role, ['member', 'steward']);
        break;
      }
      case 'leave':
        if (user.id === s.ownerId)
          fail(
            'The founding steward must archive the co-op rather than leave.',
          );
        member.status = 'removed';
        break;
      case 'archive':
        if (user.id !== s.ownerId)
          fail('Only the founding steward can archive.', 403);
        s.visibility = 'archived';
        break;
      case 'create_project':
        s.projects.push({
          id,
          name: required(p.name, 120),
          summary: required(p.summary, 2000),
          region: required(p.region, 120),
          kind: choose(p.kind, ['ecohedge', 'landscape', 'restoration']),
          status: 'proposed',
          visibility: 'members',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      case 'project_status': {
        requireSteward(s, user.id);
        const project = find(s.projects, p.id);
        project.status = choose(p.status, [
          'proposed',
          'active',
          'completed',
          'cancelled',
        ]);
        project.visibility = choose(p.visibility, ['members', 'public']);
        break;
      }
      case 'save_boundary': {
        const parcel = find(s.parcels, p.parcelId);
        if (parcel.createdBy !== user.id) requireSteward(s, user.id);
        let boundary;
        try {
          boundary = validateBoundary(p.geometry);
        } catch (e) {
          fail(e.message);
        }
        parcel.boundaries ??= [];
        if (parcel.boundaries.length >= 20)
          fail('Boundary version limit reached.');
        parcel.boundaries.push({
          id,
          ...boundary,
          consentReference: required(p.consentReference, 300),
          externalSearchAllowed: p.externalSearchAllowed === true,
          createdBy: user.id,
          createdAt: now,
          status: 'submitted',
        });
        break;
      }
      case 'review_boundary': {
        requireSteward(s, user.id);
        const parcel = find(s.parcels, p.parcelId);
        review(
          find(parcel.boundaries ?? [], p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'revoke_satellite_consent': {
        const parcel = find(s.parcels, p.parcelId);
        if (parcel.createdBy !== user.id) requireSteward(s, user.id);
        const boundary = find(parcel.boundaries ?? [], p.id);
        boundary.externalSearchAllowed = false;
        boundary.consentRevokedAt = now;
        break;
      }
      case 'record_satellite_search': {
        const parcel = find(s.parcels, p.parcelId);
        if (parcel.createdBy !== user.id) requireSteward(s, user.id);
        const boundary = parcel.boundaries?.at(-1);
        if (
          !boundary ||
          boundary.id !== p.boundaryId ||
          boundary.status !== 'reviewed' ||
          !boundary.externalSearchAllowed
        )
          fail(
            'The current boundary must be reviewed and allow external searches.',
          );
        s.satelliteSearches ??= [];
        if (s.satelliteSearches.length >= 200)
          fail('Monitoring search limit reached.');
        s.satelliteSearches.push({
          id,
          ...p,
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'record_observation': {
        const parcel = find(s.parcels, p.parcelId);
        if (parcel.createdBy !== user.id) requireSteward(s, user.id);
        const boundary = parcel.boundaries?.at(-1);
        if (!boundary || boundary.status !== 'reviewed')
          fail('Review the current boundary first.');
        const observedAt = integer(p.observedAt, 8640000000000000);
        if (observedAt > now)
          fail('Observation dates cannot be in the future.');
        s.observations ??= [];
        if (s.observations.length >= 1000) fail('Observation limit reached.');
        s.observations.push({
          id,
          parcelId: parcel.id,
          boundaryId: boundary.id,
          observedAt,
          method: required(p.method, 1000),
          finding: required(p.finding, 2000),
          reference: safeLink(p.reference),
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_observation':
        requireSteward(s, user.id);
        review(
          find(s.observations ?? [], p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      case 'record_parcel': {
        find(s.projects, p.projectId);
        s.parcels.push({
          id,
          projectId: p.projectId,
          name: required(p.name, 120),
          landReference: required(p.landReference, 300),
          areaSquareMetres: integer(p.areaSquareMetres, 1e12),
          consentReference: required(p.consentReference, 300),
          notes: optional(p.notes, 2000),
          createdBy: user.id,
          createdAt: now,
          status: 'submitted',
        });
        break;
      }
      case 'review_parcel': {
        requireSteward(s, user.id);
        review(
          find(s.parcels, p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'record_authority': {
        requireSteward(s, user.id);
        if (s.authority?.status === 'reviewed')
          fail('Reviewed authority is frozen in this release.');
        approvedEvidence(s, p.evidenceId);
        s.authority = {
          id,
          legalName: required(p.legalName, 200),
          jurisdiction: required(p.jurisdiction, 160),
          reference: required(p.reference, 300),
          evidenceId: p.evidenceId,
          createdBy: user.id,
          createdAt: now,
          status: 'submitted',
        };
        break;
      }
      case 'review_authority': {
        requireSteward(s, user.id);
        if (!s.authority) fail('Submit an authority record first.');
        review(
          s.authority,
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'create_event': {
        const project = find(s.projects, p.projectId);
        if (project.status === 'cancelled') fail('Choose an active project.');
        const startsAt = integer(p.startsAt, 8640000000000000),
          endsAt = integer(p.endsAt, 8640000000000000);
        if (
          startsAt <= now ||
          endsAt <= startsAt ||
          endsAt - startsAt > 7 * 86400000
        )
          fail('Choose a future start and an end within seven days.');
        const visibility = choose(p.visibility, ['members', 'public']);
        if (visibility === 'public') requireSteward(s, user.id);
        const timeZone = required(p.timeZone, 100);
        try {
          new Intl.DateTimeFormat('en', { timeZone });
        } catch {
          fail('Choose a valid time zone.');
        }
        s.events ??= [];
        if (s.events.length >= 200)
          fail('This co-op has reached its event limit.');
        s.events.push({
          id,
          projectId: p.projectId,
          title: required(p.title, 160),
          summary: required(p.summary, 2000),
          meetingDetails: required(p.meetingDetails, 2000),
          startsAt,
          endsAt,
          timeZone,
          visibility,
          capacity: integer(p.capacity, 500),
          status: 'scheduled',
          hidden: false,
          rsvps: [],
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'cancel_event': {
        const event = find(s.events ?? [], p.id);
        if (event.createdBy !== user.id) requireSteward(s, user.id);
        event.status = 'cancelled';
        event.cancelReason = required(p.reason, 500);
        break;
      }
      case 'event_rsvp': {
        const event = find(s.events ?? [], p.id);
        if (
          event.status !== 'scheduled' ||
          event.hidden ||
          event.endsAt <= now ||
          find(s.projects, event.projectId).status === 'cancelled'
        )
          fail('This event is no longer accepting responses.');
        const response = choose(p.response, [
          'going',
          'interested',
          'not_going',
        ]);
        const going = event.rsvps.filter(
          (x) =>
            x.userId !== user.id &&
            x.response === 'going' &&
            membership(s, x.userId),
        ).length;
        if (response === 'going' && event.capacity && going >= event.capacity)
          fail(
            'All available places are taken. Choose interested or check back later.',
          );
        event.rsvps = event.rsvps.filter((x) => x.userId !== user.id);
        event.rsvps.push({ userId: user.id, response, at: now });
        break;
      }
      case 'post_comment': {
        const update = find(s.updates, p.updateId);
        if (update.hidden) fail('This discussion is unavailable.');
        s.comments ??= [];
        if (s.comments.length >= 1000)
          fail('This co-op has reached its discussion limit.');
        s.comments.push({
          id,
          updateId: update.id,
          text: required(p.text, 2000),
          author: member.name,
          createdBy: user.id,
          createdAt: now,
          hidden: false,
        });
        break;
      }
      case 'remove_comment': {
        const comment = find(s.comments ?? [], p.id);
        if (comment.createdBy !== user.id) requireSteward(s, user.id);
        comment.hidden = true;
        break;
      }
      case 'report_content': {
        const kind = choose(p.kind, ['update', 'comment', 'event']);
        const target = find(
          kind === 'update'
            ? s.updates
            : kind === 'comment'
              ? (s.comments ?? [])
              : (s.events ?? []),
          p.targetId,
        );
        if (target.hidden) fail('This content is already hidden.');
        s.reports ??= [];
        if (s.reports.length >= 500)
          fail('This co-op has reached its report limit. Contact a steward.');
        if (
          s.reports.some(
            (x) =>
              x.createdBy === user.id &&
              x.targetId === target.id &&
              x.kind === kind &&
              x.status === 'open',
          )
        )
          fail('Your report is already awaiting review.');
        s.reports.push({
          id,
          kind,
          targetId: target.id,
          reason: required(p.reason, 2000),
          status: 'open',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'resolve_report': {
        requireSteward(s, user.id);
        const report = find(s.reports ?? [], p.id);
        if (report.status !== 'open') fail('This report was already resolved.');
        const decision = choose(p.decision, ['hide', 'dismiss']);
        const target = find(
          report.kind === 'update'
            ? s.updates
            : report.kind === 'comment'
              ? (s.comments ?? [])
              : (s.events ?? []),
          report.targetId,
        );
        if (target.createdBy === user.id)
          fail('Another steward must review a report about your content.', 403);
        if (decision === 'hide') target.hidden = true;
        report.status = decision === 'hide' ? 'hidden' : 'dismissed';
        report.note = required(p.note, 1000);
        report.reviewedAt = now;
        report.reviewedBy = user.id;
        break;
      }
      case 'post_update': {
        find(s.projects, p.projectId);
        const visibility = choose(p.visibility, ['members', 'public']);
        if (visibility === 'public') requireSteward(s, user.id);
        s.updates.push({
          id,
          projectId: p.projectId,
          text: required(p.text, 2000),
          visibility,
          author: member.name,
          createdBy: user.id,
          createdAt: now,
          hidden: false,
        });
        break;
      }
      case 'hide_update': {
        requireSteward(s, user.id);
        find(s.updates, p.id).hidden = true;
        break;
      }
      case 'create_task': {
        find(s.projects, p.projectId);
        s.tasks.push({
          id,
          projectId: p.projectId,
          title: required(p.title, 200),
          due: optional(p.due, 10),
          status: 'open',
          assignee: null,
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'task_status': {
        const t = find(s.tasks, p.id);
        const status = choose(p.status, ['claimed', 'completed', 'open']);
        if (t.assignee && t.assignee !== user.id && !isSteward(s, user.id))
          fail('This action is assigned to another member.', 403);
        t.status = status;
        t.assignee = status === 'open' ? null : user.id;
        t.completedAt = status === 'completed' ? now : null;
        break;
      }
      case 'submit_agreement': {
        find(s.projects, p.projectId);
        s.agreements.push({
          id,
          projectId: p.projectId,
          kind: choose(p.kind, ['enrollment', 'easement', 'carbon_rights']),
          jurisdiction: required(p.jurisdiction, 120),
          holder: required(p.holder, 160),
          notes: required(p.notes, 3000),
          reference: safeLink(p.reference),
          createdBy: user.id,
          createdAt: now,
          status: 'submitted',
          reviewNote: '',
          recordingReference: '',
          executionReference: '',
        });
        break;
      }
      case 'review_agreement': {
        requireSteward(s, user.id);
        const a = find(s.agreements, p.id);
        if (a.status === 'execution_recorded')
          fail(
            'Executed references are frozen; submit a new agreement to record amendments.',
          );
        if (a.createdBy === user.id)
          fail('Another steward must review the agreement.', 403);
        const status = choose(p.status, [
          'changes_requested',
          'reviewed',
          'execution_recorded',
        ]);
        if (status === 'execution_recorded' && a.status !== 'reviewed')
          fail('Review the agreement before recording execution.');
        a.reviewNote = required(p.note, 2000);
        if (status === 'execution_recorded') {
          a.executionReference = required(p.executionReference, 300);
          if (a.kind === 'easement')
            a.recordingReference = required(p.recordingReference, 300);
        }
        a.status = status;
        a.reviewedBy = user.id;
        a.reviewedAt = now;
        break;
      }
      case 'submit_evidence': {
        find(s.projects, p.projectId);
        const asset = p.asset ?? null;
        if (asset && asset.uploaderId !== user.id)
          fail('You may only attach your own upload.', 403);
        s.evidence.push({
          id,
          projectId: p.projectId,
          title: required(p.title, 160),
          method: required(p.method, 200),
          period: required(p.period, 80),
          reference: safeLink(p.reference),
          notes: required(p.notes, 2000),
          asset,
          createdBy: user.id,
          createdAt: now,
          status: 'submitted',
        });
        if (!asset && !s.evidence.at(-1).reference)
          fail('Attach a file or an HTTPS evidence reference.');
        break;
      }
      case 'review_evidence': {
        requireSteward(s, user.id);
        const e = find(s.evidence, p.id);
        review(e, user.id, choose(p.decision, ['approve', 'reject']), now);
        e.reviewNote = required(p.note, 1500);
        break;
      }
      case 'propose_charter': {
        requireSteward(s, user.id);
        const electorate = s.members
          .filter((m) => m.status === 'active')
          .map((m) => m.id);
        if (
          !Array.isArray(p.shares) ||
          p.shares.length !== electorate.length ||
          p.shares.some((m) => !electorate.includes(m.id))
        )
          fail('Provide one share for every active member.');
        const shares = p.shares.map((m) => ({
          id: m.id,
          name: find(s.members, m.id).name,
          shareBps: integer(m.shareBps, 10000),
        }));
        allocateCents(0, shares, p.stewardshipBps, p.treasuryBps);
        const days = integer(p.days, 30);
        if (days < 1)
          fail(
            'Voting must stay open for at least one day unless everyone votes.',
          );
        s.proposals.push({
          id,
          title: required(p.title, 160),
          text: required(p.text, 4000),
          shares,
          stewardshipBps: p.stewardshipBps,
          treasuryBps: p.treasuryBps,
          electorate,
          quorum: Math.ceil((electorate.length * 2) / 3),
          closesAt: now + days * 86400000,
          status: 'open',
          votes: [],
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'vote': {
        const proposal = find(s.proposals, p.id);
        if (proposal.status !== 'open' || now >= proposal.closesAt)
          fail('Voting is closed.');
        if (!proposal.electorate.includes(member.id))
          fail('You are not in this proposal’s frozen electorate.', 403);
        const choice = choose(p.choice, ['approve', 'oppose', 'abstain']);
        proposal.votes = proposal.votes.filter((v) => v.memberId !== member.id);
        proposal.votes.push({ memberId: member.id, choice, at: now });
        break;
      }
      case 'close_proposal': {
        requireSteward(s, user.id);
        const proposal = find(s.proposals, p.id);
        if (proposal.status !== 'open')
          fail('This proposal is already closed.');
        if (
          now < proposal.closesAt &&
          proposal.votes.length < proposal.electorate.length
        )
          fail('Wait for the deadline or all eligible members to vote.');
        const passed =
          proposal.votes.length >= proposal.quorum &&
          proposal.votes.filter((v) => v.choice === 'approve').length >
            proposal.electorate.length / 2;
        proposal.status = passed ? 'adopted' : 'not_adopted';
        proposal.closedAt = now;
        if (passed)
          s.charters.push({
            id: proposal.id,
            version: s.charters.length + 1,
            shares: proposal.shares,
            stewardshipBps: proposal.stewardshipBps,
            treasuryBps: proposal.treasuryBps,
            adoptedAt: now,
          });
        break;
      }
      case 'record_lot': {
        requireSteward(s, user.id);
        find(s.projects, p.projectId);
        if (s.authority?.status !== 'reviewed')
          fail('Review the co-op legal authority record first.');
        if (
          !s.parcels.some(
            (a) => a.projectId === p.projectId && a.status === 'reviewed',
          )
        )
          fail('Review the parcel rights and consent record first.');
        if (
          !s.agreements.some(
            (a) =>
              a.projectId === p.projectId &&
              ['enrollment', 'easement'].includes(a.kind) &&
              a.status === 'execution_recorded',
          )
        )
          fail('Record an executed land participation agreement first.');
        if (
          !s.agreements.some(
            (a) =>
              a.projectId === p.projectId &&
              a.kind === 'carbon_rights' &&
              a.status === 'execution_recorded',
          )
        )
          fail('Record executed carbon-rights authority first.');
        approvedEvidence(s, p.evidenceId, p.projectId);
        const start = integer(p.serialStart),
          end = integer(p.serialEnd);
        if (end < start || end - start + 1 > 1e9) fail('Invalid serial range.');
        const registry = required(p.registry, 100).toLowerCase(),
          program = required(p.program, 100).toLowerCase(),
          serialPrefix = required(p.serialPrefix, 200),
          vintage = required(p.vintage, 20);
        if (
          s.lots.some(
            (l) =>
              l.registry === registry &&
              l.program === program &&
              l.serialPrefix === serialPrefix &&
              Math.max(start, l.serialStart) <= Math.min(end, l.serialEnd),
          )
        )
          fail('This serial range overlaps an existing holding.');
        s.lots.push({
          id,
          projectId: p.projectId,
          registry,
          program,
          serialPrefix,
          vintage,
          method: required(p.method, 160),
          serialStart: start,
          serialEnd: end,
          units: end - start + 1,
          unit: 'tCO2e',
          evidenceId: p.evidenceId,
          reference: required(p.reference, 300),
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_lot': {
        requireSteward(s, user.id);
        review(
          find(s.lots, p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'record_settlement': {
        requireSteward(s, user.id);
        const lot = find(s.lots, p.lotId);
        if (lot.status !== 'reviewed')
          fail('Review the issuance record first.');
        approvedEvidence(s, p.evidenceId, lot.projectId);
        const units = integer(p.units, 1e9),
          cents = integer(p.cents);
        if (!units || !cents) fail('Record positive units and settled cash.');
        const used = s.settlements
          .filter((x) => x.lotId === lot.id && x.status !== 'rejected')
          .reduce((sum, x) => sum + x.units, 0);
        if (used + units > lot.units)
          fail('The holding does not have enough uncommitted units.');
        const reference = required(p.reference, 300);
        if (s.settlements.some((x) => x.reference === reference))
          fail('This settlement reference is already recorded.');
        s.settlements.push({
          id,
          lotId: lot.id,
          units,
          cents,
          currency: s.currency ?? 'USD',
          reference,
          evidenceId: p.evidenceId,
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_settlement': {
        requireSteward(s, user.id);
        review(
          find(s.settlements, p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'create_allocation': {
        requireSteward(s, user.id);
        const settlement = find(s.settlements, p.settlementId);
        if (settlement.status !== 'reviewed')
          fail('Review the settlement receipt first.');
        if (s.allocations.some((a) => a.settlementId === settlement.id))
          fail('This receipt already has an allocation.');
        const charter = find(s.charters, p.charterId);
        s.allocations.push({
          id,
          settlementId: settlement.id,
          charterId: charter.id,
          amounts: allocateCents(
            settlement.cents,
            charter.shares,
            charter.stewardshipBps,
            charter.treasuryBps,
          ),
          status: 'draft',
          createdBy: user.id,
          createdAt: now,
          payments: [],
        });
        break;
      }
      case 'approve_allocation': {
        requireSteward(s, user.id);
        const a = find(s.allocations, p.id);
        if (a.createdBy === user.id)
          fail('Another steward must approve the allocation.', 403);
        if (a.status !== 'draft') fail('Allocation is already approved.');
        a.status = 'approved';
        a.approvedBy = user.id;
        break;
      }
      case 'record_payment': {
        requireSteward(s, user.id);
        const a = find(s.allocations, p.id);
        if (a.status !== 'approved') fail('Approve the allocation first.');
        const m = find(a.amounts.members, p.memberId);
        if (!m.cents) fail('No payment is due for this member.');
        if (
          a.payments.some((x) => x.memberId === m.id && x.status !== 'rejected')
        )
          fail('A payment record already exists for this member.');
        approvedEvidence(s, p.evidenceId);
        const reference = required(p.reference, 300);
        if (
          s.allocations.some((x) =>
            x.payments.some((y) => y.reference === reference),
          )
        )
          fail('This payment reference is already recorded.');
        a.payments.push({
          id,
          memberId: m.id,
          cents: m.cents,
          reference,
          evidenceId: p.evidenceId,
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_payment': {
        requireSteward(s, user.id);
        const a = find(s.allocations, p.id);
        review(
          find(a.payments, p.paymentId),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      case 'record_retirement': {
        requireSteward(s, user.id);
        const settlement = find(s.settlements, p.settlementId);
        if (settlement.status !== 'reviewed')
          fail('Select a reviewed settlement.');
        approvedEvidence(s, p.evidenceId);
        const units = integer(p.units, 1e9);
        if (
          !units ||
          units +
            s.retirements
              .filter(
                (x) =>
                  x.settlementId === settlement.id && x.status !== 'rejected',
              )
              .reduce((n, x) => n + x.units, 0) >
            settlement.units
        )
          fail('Retirement exceeds the recorded transferred units.');
        s.retirements.push({
          id,
          settlementId: settlement.id,
          units,
          beneficiary: required(p.beneficiary, 200),
          reference: required(p.reference, 300),
          evidenceId: p.evidenceId,
          status: 'submitted',
          createdBy: user.id,
          createdAt: now,
        });
        break;
      }
      case 'review_retirement': {
        requireSteward(s, user.id);
        review(
          find(s.retirements, p.id),
          user.id,
          choose(p.decision, ['approve', 'reject']),
          now,
        );
        break;
      }
      default:
        fail('Unknown operation.');
    }
  }
  s.updatedAt = now;
  if (s.audit.length >= 5000)
    fail(
      'This pilot workspace needs an archival migration before more writes.',
    );
  s.audit.push({
    id,
    sequence: s.audit.length + 1,
    action: op,
    actorId: user.id,
    at: now,
  });
  if (new TextEncoder().encode(JSON.stringify(s)).length > 750000)
    fail(
      'This pilot workspace has reached its storage limit. Export it and contact the maintainer.',
    );
  return s;
}
export function publicWorkspace(s) {
  const projects = s.projects
    .filter((p) => p.visibility === 'public' && p.status !== 'cancelled')
    .map(({ id, name, summary, region, kind, status }) => ({
      id,
      name,
      summary,
      region,
      kind,
      status,
    }));
  return {
    id: s.id,
    name: s.name,
    region: s.region,
    country: s.country ?? '',
    summary: s.summary,
    projects,
    events: (s.events ?? [])
      .filter(
        (e) =>
          e.visibility === 'public' &&
          !e.hidden &&
          projects.some((p) => p.id === e.projectId),
      )
      .map(
        ({
          id,
          projectId,
          title,
          summary,
          startsAt,
          endsAt,
          timeZone,
          status,
        }) => ({
          id,
          projectId,
          title,
          summary,
          startsAt,
          endsAt,
          timeZone,
          status,
        }),
      ),
    organization:
      s.organization?.visibility === 'public' ? s.organization : null,
    updates: s.updates
      .filter(
        (u) =>
          u.visibility === 'public' &&
          !u.hidden &&
          projects.some((p) => p.id === u.projectId),
      )
      .map(({ id, projectId, text, createdAt }) => ({
        id,
        projectId,
        text,
        createdAt,
      })),
    memberCount: s.members.filter((m) => m.status === 'active').length,
  };
}
export function memberView(s, userId) {
  const viewer = requireMember(s, userId);
  const steward = isSteward(s, userId);
  const copy = structuredClone(s);
  copy.members = copy.members
    .filter((m) => m.status === 'active' || steward || m.userId === userId)
    .map(({ userId: uid, ...m }) => ({ ...m, isYou: uid === userId }));
  copy.ownerId = undefined;
  copy.invitations = steward
    ? (copy.invitations ?? []).map(({ tokenHash, usedBy, ...i }) => ({
        ...i,
        used: !!usedBy,
      }))
    : [];
  copy.assessments = steward ? (copy.assessments ?? []) : [];
  copy.parcels = copy.parcels.filter((p) => steward || p.createdBy === userId);
  copy.satelliteSearches = (copy.satelliteSearches ?? []).filter((x) =>
    copy.parcels.some((p) => p.id === x.parcelId),
  );
  copy.observations = (copy.observations ?? []).filter((x) =>
    copy.parcels.some((p) => p.id === x.parcelId),
  );
  copy.agreements = copy.agreements.filter(
    (a) => steward || a.createdBy === userId,
  );
  copy.evidence = copy.evidence.filter(
    (e) => steward || e.createdBy === userId,
  );
  copy.evidence.forEach((e) => {
    if (e.asset) {
      delete e.asset.objectKey;
      delete e.asset.uploaderId;
    }
  });
  copy.updates = copy.updates.filter((u) => !u.hidden || steward);
  copy.events = (copy.events ?? [])
    .filter((e) => !e.hidden || steward)
    .map(({ createdBy, rsvps, ...e }) => ({
      ...e,
      isOrganizer: createdBy === userId,
      goingCount: rsvps.filter(
        (x) => x.response === 'going' && membership(s, x.userId),
      ).length,
      yourResponse: rsvps.find((x) => x.userId === userId)?.response ?? '',
      attendees:
        steward || createdBy === userId
          ? rsvps
              .filter((x) => membership(s, x.userId))
              .map((x) => ({
                name: membership(s, x.userId).name,
                response: x.response,
              }))
          : [],
    }));
  copy.comments = (copy.comments ?? [])
    .filter(
      (c) =>
        (!c.hidden || steward) && copy.updates.some((u) => u.id === c.updateId),
    )
    .map(({ createdBy, ...c }) => ({ ...c, isYou: createdBy === userId }));
  copy.reports = (copy.reports ?? [])
    .filter((r) => steward || r.createdBy === userId)
    .map(({ createdBy, reviewedBy, ...r }) => ({
      ...r,
      isYou: createdBy === userId,
    }));
  copy.audit = copy.audit.map(({ actorId, ...a }) => ({
    ...a,
    actor: s.members.find((m) => m.userId === actorId)?.name ?? 'Former member',
  }));
  return {
    state: copy,
    role: viewer.role,
    memberId: viewer.id,
    isOwner: s.ownerId === userId,
  };
}
