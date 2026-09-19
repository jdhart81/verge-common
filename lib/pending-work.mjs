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
  if (steward)
    add(
      'authority',
      'settings',
      submitted([state.authority]),
      'authority records awaiting review',
    );
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
