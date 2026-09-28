import { parcelConsentIsCurrent } from './readiness.mjs';

/**
 * Navigation suggestions from the server's memberView projection only. These
 * cards never execute commands, replace consent, or certify external outcomes.
 */
export function conversationActions(
  state,
  {
    steward = false,
    memberId = '',
    now = Date.now(),
    growthPaused = false,
  } = {},
) {
  const viewer = state?.members?.find(
    (member) =>
      member.id === memberId && member.isYou && member.status === 'active',
  );
  if (!viewer) return [];
  const manages = steward && viewer.role === 'steward';
  const paused = state.visibility === 'archived' || growthPaused;
  const clockReady = Number.isFinite(now) && now > 0;
  const readStatus =
    state.visibility === 'archived' ? 'Archived' : 'Activity paused';
  const actions = [];
  const add = (id, title, description, actionLabel, panel, status) =>
    actions.push({ id, title, description, actionLabel, panel, status });
  const projects = state.projects ?? [];
  const parcels = state.parcels ?? [];
  const activeParcels = parcels.filter(
    (parcel) => parcel.status !== 'withdrawn',
  );
  const landId = manages ? 'steward-land' : 'member-land';

  add(
    'project',
    projects.length
      ? 'Your conservation projects'
      : 'Start with a shared place',
    paused
      ? 'View the projects and discussions already recorded by your group.'
      : projects.length
        ? 'Open a project to review its purpose and current activities.'
        : 'Describe the place and conservation work your neighbors want to organize.',
    paused || projects.length ? 'View projects' : 'Create a project',
    'projects',
    paused ? readStatus : 'Group planning',
  );

  if (manages)
    add(
      'steward-circle',
      'Your neighbor circle',
      paused
        ? 'Review membership and existing invitations. Invitations can still be revoked.'
        : 'Invite neighbors, review membership requests, and appoint another steward for independent reviews.',
      paused ? 'Review members' : 'Invite and review members',
      'members',
      paused ? readStatus : 'Steward review',
    );

  if (paused) {
    if (parcels.length)
      add(
        landId,
        manages ? 'Land records and withdrawals' : 'Your land and consent',
        'View existing land records. Consent revocation and land withdrawal remain safety actions, subject to available storage.',
        'Review land and consent',
        'parcels',
        readStatus,
      );
  } else if (projects.length) {
    if (!activeParcels.length) {
      add(
        landId,
        manages
          ? 'Bring land into the conversation'
          : 'Add your land privately',
        'Record a parcel before mapping its boundary. Land details stay private to its contributor and co-op stewards.',
        'Record a parcel',
        'parcels',
        manages ? 'Land intake' : 'Your land',
      );
    } else if (activeParcels.some((parcel) => parcel.status !== 'reviewed')) {
      add(
        landId,
        manages ? 'Review the land records' : 'Your land records need review',
        'A different steward must review submitted land records before parcel-specific pooling consent can be recorded.',
        'Review land records',
        'parcels',
        'Needs review',
      );
    } else if (
      activeParcels.some((parcel) => !parcelConsentIsCurrent(parcel))
    ) {
      add(
        landId,
        manages
          ? 'Review parcel-specific pooling consent'
          : 'Review your pooling consent',
        'Consent must explicitly cover the current parcel and boundary and receive an independent review. A chat reply does not grant consent.',
        'Review pooling consent',
        'parcels',
        'Consent review',
      );
    } else {
      add(
        landId,
        manages ? 'Review land and consent records' : 'Your land and consent',
        manages
          ? 'View the current land and consent records or record a withdrawal. The pooling assessment has additional requirements.'
          : 'View your current land and consent records or withdraw consent. Your records do not establish readiness for the whole co-op.',
        'View land and consent',
        'parcels',
        manages ? 'Land records' : 'Your land',
      );
    }
  }

  // Keep this destination stable after saving a boundary or consent so the
  // contributor can reopen the same map throughout review and withdrawal.
  if (parcels.length)
    add(
      manages ? 'steward-mapping' : 'member-mapping',
      manages ? 'Map and review parcel boundaries' : 'Your parcel map',
      paused || !activeParcels.length
        ? 'View existing boundary and monitoring records. Existing permission for satellite searches can still be revoked.'
        : 'Draw or import a boundary, arrange independent review, and revisit monitoring records. Mapping alone does not grant pooling consent.',
      paused || !activeParcels.length
        ? 'View parcel maps'
        : 'Open parcel mapping',
      'monitoring',
      paused ? readStatus : manages ? 'Boundary review' : 'Your land',
    );

  if (projects.length)
    add(
      manages ? 'steward-evidence' : 'member-evidence',
      manages ? 'Review supporting evidence' : 'Your supporting evidence',
      paused
        ? 'View the supporting records available to you. Files remain private to their uploader and co-op stewards.'
        : 'Upload supporting documents or references for review. Files remain private to their uploader and co-op stewards.',
      paused
        ? 'View evidence'
        : manages
          ? 'Upload and review evidence'
          : 'Upload supporting evidence',
      'evidence',
      paused ? readStatus : manages ? 'Steward review' : 'Your evidence',
    );

  if (manages && projects.length)
    add(
      'steward-pooling',
      'Review the shared land pool',
      'Review consent, boundary overlap, and pathway assessments across the co-op. Eligibility and credit issuance require external review.',
      paused ? 'View pooling records' : 'Review pooling requirements',
      'pooling',
      paused ? readStatus : 'Steward review',
    );

  const represented = (state.partnerships ?? []).filter(
    (partner) => partner.representative?.isRepresentative,
  );
  if (manages && projects.length) {
    add(
      'steward-partner',
      'Work with a conservation partner',
      paused
        ? 'View partner records and participation. Existing participation can still be ended.'
        : 'Record an agreed role, invite its named representative, and arrange an independent authority review.',
      paused ? 'View partner records' : 'Review partner participation',
      'organizations',
      paused ? readStatus : 'Partner participation',
    );
  } else if (represented.length) {
    const invitationOpen =
      clockReady &&
      represented.some(
        (partner) =>
          partner.participationStatus === 'invited' &&
          partner.representative.expiresAt > now,
      );
    add(
      'member-partner',
      invitationOpen && !paused
        ? 'Your conservation partner invitation'
        : 'Your partner participation',
      paused
        ? 'Review your participation. Declining an available invitation or ending participation remains a safety action.'
        : invitationOpen
          ? 'Read the offered role and respond explicitly as the invited representative. Acceptance does not sign a conservation agreement.'
          : 'View the role and review history offered to you. Current participation can be ended here.',
      invitationOpen && !paused
        ? 'Review your invitation'
        : 'View your participation',
      'organizations',
      paused
        ? readStatus
        : invitationOpen
          ? 'Invitation open'
          : 'Your participation',
    );
  }

  if (manages && projects.length)
    add(
      'steward-agreements',
      'Document conservation agreements',
      'Review parcel coverage, participation agreements, and carbon rights. Signatures and legal execution happen with the relevant people outside the app.',
      paused ? 'View agreement records' : 'Review conservation agreements',
      'agreements',
      paused ? readStatus : 'External step',
    );
  else if (
    !manages &&
    ((state.agreements ?? []).length ||
      activeParcels.some(parcelConsentIsCurrent))
  )
    add(
      'member-agreements',
      'Your parcel agreements',
      paused
        ? 'View your recorded agreements or withdraw a record. Legal obligations require review with the relevant people outside the app.'
        : 'Record or review agreements covering your own parcels with current reviewed consent. Signatures and legal execution happen outside the app.',
      paused ? 'View your agreements' : 'Review your parcel agreements',
      'agreements',
      paused ? readStatus : 'Your agreement records',
    );

  if (manages && projects.length)
    add(
      'steward-authority',
      'Co-op legal authority',
      'Review evidence of the co-op’s legal identity and authority. Recording this evidence does not create a legal entity or grant carbon rights.',
      paused ? 'View authority records' : 'Review legal authority',
      'authority',
      paused ? readStatus : 'External step',
    );

  const proposals = state.proposals ?? [];
  const eligible = clockReady
    ? proposals.filter(
        (proposal) =>
          proposal.status === 'open' &&
          proposal.closesAt > now &&
          proposal.electorate?.includes(memberId),
      )
    : [];
  if (eligible.length && !paused) {
    const needsVote = eligible.some(
      (proposal) => !proposal.votes?.some((vote) => vote.memberId === memberId),
    );
    add(
      'member-vote',
      'Decide how benefits are shared',
      'Read the proposed allocation policy and cast or update your vote before its deadline. A conversation reply does not count as a vote.',
      needsVote ? 'Review and vote' : 'Review your vote',
      'governance',
      'Vote open',
    );
  } else if (manages || proposals.length || (state.charters ?? []).length) {
    add(
      manages ? 'steward-governance' : 'member-governance',
      'Your benefit-sharing policy',
      manages && !paused
        ? 'Prepare an allocation proposal or review and tally existing member votes.'
        : 'View proposals, voting history, and adopted allocation policies.',
      manages && !paused ? 'Review benefit sharing' : 'View benefit sharing',
      'governance',
      paused ? readStatus : 'Group decisions',
    );
  }

  if (manages && projects.length) {
    add(
      'steward-ledger',
      'Review external credit and payment receipts',
      paused || state.financialRecordsRedactedAt
        ? 'View existing external receipt records. Verge Common does not issue credits, execute sales, or send money.'
        : 'Record and independently review issuance, sale, and payment receipts. Verge Common does not issue credits, execute sales, or send money.',
      paused || state.financialRecordsRedactedAt
        ? 'View external records'
        : 'Review external receipts',
      'ledger',
      paused
        ? readStatus
        : state.financialRecordsRedactedAt
          ? 'Recording paused'
          : 'External records',
    );
  } else if (
    (state.allocations ?? []).some((allocation) =>
      allocation.amounts?.members?.some((member) => member.id === memberId),
    )
  ) {
    add(
      'member-allocation',
      'Review your recorded allocation',
      'Find your share in the co-op allocation records and review any external payment receipt. A recorded amount is not confirmation that money arrived.',
      'View allocation records',
      'ledger',
      paused ? readStatus : 'Recorded allocation',
    );
  }
  // Prioritize an available decision or an unfinished personal land step over
  // generic navigation. Sorting changes only when the underlying workflow or a
  // deadline changes, never merely because the clock ticks.
  const priority = (action) => {
    if (!paused) {
      if (action.id === 'member-vote') return 0;
      if (action.id === 'member-partner' && action.status === 'Invitation open')
        return 1;
      if (action.id === 'project' && !projects.length) return 2;
      if (
        action.panel === 'monitoring' &&
        activeParcels.some(
          (parcel) => parcel.boundaries?.at(-1)?.status !== 'reviewed',
        )
      )
        return 3;
      if (action.panel === 'parcels' && !activeParcels.length) return 4;
      if (
        action.panel === 'parcels' &&
        ['Needs review', 'Consent review'].includes(action.status)
      )
        return 4;
    }
    if (action.id === 'project' && projects.length) return 20;
    return 10;
  };
  return actions.sort((a, b) => priority(a) - priority(b));
}
