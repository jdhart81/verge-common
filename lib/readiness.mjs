// Preparation records only: never a carbon certificate or permission to pay.
export function parcelSnapshot(state, projectId) {
  return state.parcels
    .filter((p) => p.projectId === projectId && p.status === 'reviewed')
    .map((p) => ({
      id: p.id,
      areaSquareMetres: p.areaSquareMetres,
      consentReference: p.consentReference,
      boundaryId: p.boundaries?.at(-1)?.id ?? null,
      boundaryStatus: p.boundaries?.at(-1)?.status ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function assessmentIsCurrent(state, assessment) {
  return (
    Array.isArray(assessment.parcelSnapshot) &&
    JSON.stringify(assessment.parcelSnapshot) ===
      JSON.stringify(parcelSnapshot(state, assessment.projectId))
  );
}

export function projectReadiness(state, projectId) {
  const parcels = state.parcels.filter((p) => p.projectId === projectId);
  const reviewed = parcels.filter((p) => p.status === 'reviewed');
  const assessment = (state.assessments ?? [])
    .filter((a) => a.projectId === projectId)
    .at(-1);
  const partnerships = (state.partnerships ?? []).filter(
    (p) => p.projectId === projectId,
  );
  const executed = (kinds) =>
    state.agreements.some(
      (a) =>
        a.projectId === projectId &&
        kinds.includes(a.kind) &&
        a.status === 'execution_recorded',
    );
  const checks = [
    {
      id: 'neighbors',
      label: 'At least two active co-op members',
      complete: state.members.filter((m) => m.status === 'active').length >= 2,
    },
    {
      id: 'partner',
      label: 'Conservation partner agreement independently reviewed',
      complete: partnerships.some((p) => p.status === 'reviewed'),
    },
    {
      id: 'parcels',
      label: 'At least two parcels, with all submitted parcels reviewed',
      complete: reviewed.length >= 2 && reviewed.length === parcels.length,
    },
    {
      id: 'boundaries',
      label: 'Current boundaries reviewed for every pooled parcel',
      complete:
        reviewed.length > 0 &&
        reviewed.every((p) => p.boundaries?.at(-1)?.status === 'reviewed'),
    },
    {
      id: 'assessment',
      label: 'Latest pathway assessment reviewed against current land records',
      complete:
        !!assessment &&
        assessment.status === 'reviewed' &&
        assessmentIsCurrent(state, assessment),
    },
    {
      id: 'area',
      label:
        'Current recorded area meets the entered methodology planning threshold',
      complete:
        !!assessment &&
        assessmentIsCurrent(state, assessment) &&
        assessment.areaSquareMetres >= assessment.minimumSquareMetres,
    },
    {
      id: 'participation',
      label: 'Executed participation agreement recorded',
      complete: executed(['enrollment', 'easement']),
    },
    {
      id: 'rights',
      label: 'Executed carbon-rights authority recorded',
      complete: executed(['carbon_rights']),
    },
    {
      id: 'authority',
      label: 'Co-op legal authority record reviewed',
      complete: state.authority?.status === 'reviewed',
    },
    {
      id: 'charter',
      label: 'Member allocation charter adopted',
      complete: state.charters.length > 0,
    },
  ];
  return {
    projectId,
    status: checks.every((c) => c.complete)
      ? 'records_prepared_for_external_review'
      : 'preparation_incomplete',
    checks,
    // These cannot be inferred from steward-entered software records.
    externalRequirements: [
      'Qualified reviewers must confirm parcel-level rights, consent, non-overlap, and legal agreements.',
      'The program and verifier must establish eligibility, additionality, permanence, monitoring, and issuance.',
      'Registry custody, a real sale, cleared proceeds, and authorized payment arrangements are required before payouts.',
    ],
  };
}
