import {
  validateBoundary,
  boundaryOverlapSquareMetres,
} from './monitoring.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const pooledParcels = (state, projectId) =>
  state.parcels.filter(
    (p) => p.projectId === projectId && p.status !== 'withdrawn',
  );

// Binding consent to a boundary version prevents reusing an old consent for more land.
export function consentLandSnapshot(parcel) {
  const boundary = parcel.boundaries?.at(-1);
  return {
    parcelId: parcel.id,
    landReference: parcel.landReference ?? null,
    declaredAreaSquareMetres: parcel.areaSquareMetres,
    boundaryId: boundary?.id ?? null,
    geometry: boundary?.geometry ?? null,
  };
}
export function parcelConsentIsCurrent(parcel) {
  const consent = parcel.consents?.at(-1);
  return (
    !!consent &&
    consent.status === 'reviewed' &&
    parcel.status === 'reviewed' &&
    parcel.boundaries?.at(-1)?.status === 'reviewed' &&
    same(consent.landSnapshot, consentLandSnapshot(parcel))
  );
}
function parcelVersion(parcel) {
  const boundary = parcel.boundaries?.at(-1),
    consent = parcel.consents?.at(-1);
  return {
    ...consentLandSnapshot(parcel),
    status: parcel.status,
    consentReference: parcel.consentReference,
    boundaryStatus: boundary?.status ?? null,
    consentId: consent?.id ?? null,
    consentStatus: consent?.status ?? null,
  };
}
// Includes submitted parcels so adding unreviewed land invalidates the assessment too.
export function parcelSnapshot(state, projectId) {
  return pooledParcels(state, projectId)
    .map(parcelVersion)
    .sort((a, b) => a.parcelId.localeCompare(b.parcelId));
}
export function agreementCoverageSnapshot(state, projectId, parcelIds) {
  if (
    !Array.isArray(parcelIds) ||
    !parcelIds.length ||
    new Set(parcelIds).size !== parcelIds.length
  )
    return null;
  const parcels = parcelIds.map((id) =>
    state.parcels.find(
      (p) =>
        p.id === id && p.projectId === projectId && p.status !== 'withdrawn',
    ),
  );
  if (parcels.some((p) => !p)) return null;
  return parcels
    .map(parcelVersion)
    .sort((a, b) => a.parcelId.localeCompare(b.parcelId));
}
export function agreementIsCurrent(state, agreement) {
  const snapshot = agreementCoverageSnapshot(
    state,
    agreement.projectId,
    agreement.parcelIds,
  );
  return (
    !!snapshot &&
    snapshot.every((p) =>
      parcelConsentIsCurrent(state.parcels.find((x) => x.id === p.parcelId)),
    ) &&
    same(agreement.parcelSnapshot, snapshot)
  );
}
export function parcelAgreementCovered(state, projectId, parcelId, kinds) {
  return state.agreements.some(
    (a) =>
      a.projectId === projectId &&
      kinds.includes(a.kind) &&
      a.status === 'execution_recorded' &&
      a.parcelIds?.includes(parcelId) &&
      agreementIsCurrent(state, a),
  );
}

export function landPoolGeometry(state, projectId) {
  const parcels = pooledParcels(state, projectId);
  const problems = [],
    overlaps = [],
    areas = [];
  const candidates = new Map();
  // Check all current co-op parcels: two projects cannot quietly count the same land.
  for (const p of state.parcels.filter((x) => x.status !== 'withdrawn')) {
    const boundary = p.boundaries?.at(-1);
    try {
      if (!boundary || boundary.status !== 'reviewed')
        throw new Error('Boundary needs review.');
      candidates.set(p.id, validateBoundary(boundary.geometry));
    } catch {
      if (p.projectId === projectId)
        problems.push({ parcelId: p.id, reason: 'missing_reviewed_boundary' });
    }
  }
  for (const p of parcels) {
    const boundary = candidates.get(p.id);
    if (!boundary) continue;
    const declared = p.areaSquareMetres;
    // A small drawing tolerance is a planning screen, not a legal acreage tolerance.
    const toleranceSquareMetres = Math.max(1, boundary.areaSquareMetres * 0.05);
    const agrees =
      Number.isFinite(declared) &&
      declared > 0 &&
      Math.abs(declared - boundary.areaSquareMetres) <= toleranceSquareMetres;
    areas.push({
      parcelId: p.id,
      declaredAreaSquareMetres: declared,
      boundaryAreaSquareMetres: boundary.areaSquareMetres,
      toleranceSquareMetres,
      agrees,
    });
    if (!agrees)
      problems.push({ parcelId: p.id, reason: 'declared_area_mismatch' });
  }
  const seen = new Set();
  for (const p of parcels) {
    if (!candidates.has(p.id)) continue;
    for (const other of state.parcels) {
      if (other.id === p.id || !candidates.has(other.id)) continue;
      const a = candidates.get(p.id),
        b = candidates.get(other.id);
      if (
        a.bbox[2] <= b.bbox[0] ||
        b.bbox[2] <= a.bbox[0] ||
        a.bbox[3] <= b.bbox[1] ||
        b.bbox[3] <= a.bbox[1]
      )
        continue;
      const key = [p.id, other.id].sort((a, b) => a.localeCompare(b)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const areaSquareMetres = boundaryOverlapSquareMetres(
          candidates.get(p.id).geometry,
          candidates.get(other.id).geometry,
        );
        if (areaSquareMetres > 0)
          overlaps.push({
            parcelIds: [p.id, other.id].sort((a, b) => a.localeCompare(b)),
            areaSquareMetres,
          });
      } catch {
        problems.push({ parcelId: p.id, reason: 'overlap_check_failed' });
      }
    }
  }
  return {
    complete:
      parcels.length > 0 && problems.length === 0 && overlaps.length === 0,
    areaSquareMetres: areas.reduce((n, a) => n + a.boundaryAreaSquareMetres, 0),
    areaMethod: 'turf-geodesic-v1',
    areas,
    problems,
    overlaps,
  };
}
export function assessmentIsCurrent(state, assessment) {
  return (
    assessment.areaMethod === 'turf-geodesic-v1' &&
    Array.isArray(assessment.parcelSnapshot) &&
    same(
      assessment.parcelSnapshot,
      parcelSnapshot(state, assessment.projectId),
    ) &&
    landPoolGeometry(state, assessment.projectId).complete
  );
}

// Preparation records only: never a carbon certificate or permission to pay.
export function projectReadiness(state, projectId) {
  const parcels = pooledParcels(state, projectId);
  const reviewed = parcels.filter((p) => p.status === 'reviewed');
  const geometry = landPoolGeometry(state, projectId);
  const assessment = (state.assessments ?? [])
    .filter((a) => a.projectId === projectId)
    .at(-1);
  const currentAssessment =
    !!assessment && assessmentIsCurrent(state, assessment);
  const covered = (kinds) =>
    parcels.length > 0 &&
    parcels.every((p) => parcelAgreementCovered(state, projectId, p.id, kinds));
  const checks = [
    {
      id: 'neighbors',
      label: 'At least two active co-op members',
      complete: state.members.filter((m) => m.status === 'active').length >= 2,
    },
    {
      id: 'partner',
      label: 'Conservation partner agreement independently reviewed',
      complete: (state.partnerships ?? []).some(
        (p) => p.projectId === projectId && p.status === 'reviewed',
      ),
    },
    {
      id: 'parcels',
      label: 'At least two parcels, with all included parcels reviewed',
      complete: reviewed.length >= 2 && reviewed.length === parcels.length,
    },
    {
      id: 'boundaries',
      label: 'Current boundaries reviewed for every pooled parcel',
      complete:
        parcels.length > 0 &&
        !geometry.problems.some(
          (p) => p.reason === 'missing_reviewed_boundary',
        ),
    },
    {
      id: 'geometry',
      label: 'Boundary areas match recorded areas and no co-op parcels overlap',
      complete: geometry.complete,
    },
    {
      id: 'consent',
      label: 'Current parcel-specific pooling consent independently reviewed',
      complete: parcels.length > 0 && parcels.every(parcelConsentIsCurrent),
    },
    {
      id: 'assessment',
      label: 'Latest pathway assessment reviewed against current land records',
      complete: currentAssessment && assessment.status === 'reviewed',
    },
    {
      id: 'area',
      label:
        'Boundary-derived area meets the entered methodology planning threshold',
      complete:
        currentAssessment &&
        assessment.areaSquareMetres >= assessment.minimumSquareMetres,
    },
    {
      id: 'participation',
      label:
        'Executed participation agreements cover every current pooled parcel',
      complete: covered(['enrollment', 'easement']),
    },
    {
      id: 'rights',
      label:
        'Executed carbon-rights authority covers every current pooled parcel',
      complete: covered(['carbon_rights']),
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
    geometry,
    externalRequirements: [
      'Qualified reviewers must confirm parcel-level rights, consent, surveys, non-overlap outside this co-op, and legal agreements.',
      'The program and verifier must establish eligibility, additionality, permanence, monitoring, and issuance.',
      'Registry custody, a real sale, cleared proceeds, and authorized payment arrangements are required before payouts.',
    ],
  };
}
