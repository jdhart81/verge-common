// Consume only the member-specific state returned by the server. No new data is
// fetched and these notices never send an email, push, or agent notification.
export function pendingWork(
  state,
  { steward = false, memberId = '', now = Date.now() } = {},
) {
  if (state.visibility === 'archived' || !now) return [];
  const notices = [];
  const add = (id, tab, count, label) => {
    if (count) notices.push({ id, tab, count, label });
  };
  const submitted = (records) =>
    (records ?? []).filter((record) => record?.status === 'submitted').length;
  // The server derives this flag with the viewer's real account identity.
  // A member ID is not a user ID, so comparing it with createdBy would offer
  // self-reviews. Older projections without the flag must fail closed.
  const actionable = (records, status = 'submitted') =>
    steward
      ? (records ?? []).filter(
          (record) => record?.status === status && record.canReview === true,
        ).length
      : 0;
  if (steward) {
    add(
      'membership',
      'members',
      (state.members ?? []).filter((member) => member.status === 'pending')
        .length,
      'membership requests',
    );
  }
  const parcels = (state.parcels ?? []).filter(
    (parcel) => parcel.status !== 'withdrawn',
  );
  add(
    'land',
    'parcels',
    submitted(parcels) + submitted(parcels.map((p) => p.consents?.at(-1))),
    'land records awaiting review',
  );
  add(
    'boundaries',
    'monitoring',
    submitted(parcels.map((p) => p.boundaries?.at(-1))),
    'boundaries awaiting review',
  );
  add(
    'observations',
    'monitoring',
    actionable(state.observations),
    'field observations for your review',
  );
  add(
    'imagery',
    'monitoring',
    actionable(state.analysisResults),
    'imagery results for your review',
  );
  add(
    'evidence',
    'evidence',
    submitted(state.evidence),
    'evidence records awaiting review',
  );
  add(
    'agreements',
    'agreements',
    submitted(state.agreements),
    'agreements awaiting review',
  );
  add(
    'pathway',
    'pooling',
    submitted(state.assessments),
    'pathway assessments awaiting review',
  );
  add(
    'partners',
    'organizations',
    submitted(state.partnerships),
    'partner records awaiting review',
  );
  add(
    'partner-invitations',
    'organizations',
    (state.partnerships ?? []).filter(
      (p) =>
        p.participationStatus === 'invited' &&
        p.representative?.isRepresentative &&
        p.representative.expiresAt > now,
    ).length,
    'partner invitations waiting for you',
  );
  if (steward)
    add(
      'partner-authority',
      'organizations',
      (state.partnerships ?? []).filter(
        (p) =>
          p.participationStatus === 'accepted' && p.representative?.canReview,
      ).length,
      'representative authority reviews',
    );
  if (steward)
    add(
      'authority',
      'settings',
      submitted([state.authority]),
      'authority records awaiting review',
    );
  if (steward && !state.financialRecordsRedactedAt) {
    add(
      'holdings',
      'ledger',
      actionable(state.lots),
      'issued-holding records for your review',
    );
    add(
      'settlements',
      'ledger',
      actionable(state.settlements),
      'settlement receipts for your review',
    );
    add(
      'allocations',
      'ledger',
      actionable(state.allocations, 'draft'),
      'allocations for your approval',
    );
    add(
      'payments',
      'ledger',
      actionable((state.allocations ?? []).flatMap((a) => a.payments ?? [])),
      'member-payment receipts for your review',
    );
    add(
      'disbursements',
      'ledger',
      actionable(
        (state.allocations ?? []).flatMap((a) => a.disbursements ?? []),
      ),
      'stewardship and treasury receipts for your review',
    );
    add(
      'retirements',
      'ledger',
      actionable(state.retirements),
      'credit-retirement receipts for your review',
    );
  }
  add(
    'reports',
    'community',
    (state.reports ?? []).filter((report) => report.status === 'open').length,
    steward ? 'open safety reports' : 'reports awaiting a response',
  );
  add(
    'votes',
    'governance',
    (state.proposals ?? []).filter(
      (proposal) =>
        proposal.status === 'open' &&
        proposal.closesAt > now &&
        proposal.electorate?.includes(memberId) &&
        !proposal.votes?.some((vote) => vote.memberId === memberId),
    ).length,
    'proposals awaiting your vote',
  );
  if (steward) {
    add(
      'tally',
      'governance',
      (state.proposals ?? []).filter(
        (proposal) =>
          proposal.status === 'open' &&
          (proposal.closesAt <= now ||
            (proposal.electorate?.length > 0 &&
              proposal.votes?.length >= proposal.electorate.length)),
      ).length,
      'proposals ready to tally',
    );
  }
  return notices;
}
