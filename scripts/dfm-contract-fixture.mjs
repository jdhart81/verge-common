// Writes the VergeCommon side of the DFM contract: the Landscape Package a steward downloads with
// "Download check inputs" for a stored plan, with the stored check it must reproduce. The DFM
// repository keeps a copy (packages/dfm-core/fixtures/vergecommon-plan-package.json) and tests
// that dfm-core reads it and reproduces the same result and input checksum.
//   node scripts/dfm-contract-fixture.mjs > vergecommon-plan-package.json
import { toLandscapePackage } from '@viridis/dfm-core';
import { consentParcels, planCheckInput } from '../lib/woodland-input.mjs';
import { setup, reviewedLayers, rect, cut, away } from '../tests/woodland-editor-fixture.mjs';

const reviewer = { id: 'reviewer' };
const f = setup();
reviewedLayers(f);
// One woodlot with a reviewed boundary and consent, so the package carries consent status.
const parcel = f.run('record_parcel', {
  projectId: f.project,
  name: 'Synthetic woodlot',
  landReference: 'Synthetic',
  areaSquareMetres: 1e6,
  consentReference: 'Synthetic',
});
f.run('review_parcel', { id: parcel, decision: 'approve' }, reviewer);
const boundary = f.run('save_boundary', {
  parcelId: parcel,
  geometry: rect(0, 0, 1000, 1000),
  consentReference: 'Synthetic boundary',
});
f.run('review_boundary', { parcelId: parcel, id: boundary, decision: 'approve' }, reviewer);
const consent = f.run('record_parcel_consent', {
  parcelId: parcel,
  holder: 'Synthetic holder',
  authority: 'Synthetic authority',
  reference: 'Synthetic reference',
  scope: 'Synthetic scope',
  attested: true,
});
f.run('review_parcel_consent', { parcelId: parcel, id: consent, decision: 'approve', note: 'Synthetic' }, reviewer);
const id = f.run(
  'submit_treatment_plan',
  { projectId: f.project, name: 'Synthetic winter harvest', period: '2027', treatments: [cut, away] },
  { id: 'member' },
);
const plan = f.s.treatmentPlans.find((p) => p.id === id);
const input = planCheckInput(f.s.woodlandLayers, plan, consentParcels(f.s, f.project));
const pkg = toLandscapePackage(input, {
  name: plan.name,
  generator: 'VergeCommon',
  created: '2026-10-04T00:00:00.000Z',
});
const { check } = plan;
process.stdout.write(
  JSON.stringify(
    {
      source: 'VergeCommon v0.10.0, scripts/dfm-contract-fixture.mjs',
      package: pkg,
      stored: {
        engine: check.engine,
        inputForm: check.inputForm,
        inputChecksum: check.inputChecksum,
        status: check.status,
        lostLinks: check.lostLinks,
        pinchedLinks: check.pinchedLinks,
        consent: check.consent,
      },
    },
    null,
    2,
  ) + '\n',
);
