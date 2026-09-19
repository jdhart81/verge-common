# Pooled-land preparation safeguards

VergeCommon records a proposed conservation pool. Its readiness result means **records prepared for external review**. It does not determine ownership, execute an instrument, certify eligibility, issue a carbon credit, or authorize a payment.

## Preparing each parcel

1. Record the parcel's private land reference, claimed area, and initial consent reference. A different steward reviews the intake record.
2. Draw or import one simple WGS84 polygon. A different steward reviews the boundary version.
3. Compare the recorded area with the boundary estimate in Pooling. If the recorded area is wrong, “Use boundary estimate as recorded area” preserves the old figure in the area history and requires another independent parcel review. If the boundary is wrong, submit a corrected boundary instead.
4. Record the consenting rights holder, their authority, the signed consent reference, and the agreed pooling purpose, duration, and restrictions. Explicitly confirm that the referenced consent covers this parcel and boundary. A different steward records the review.
5. Submit participation and carbon-rights agreement records, choosing the exact parcels covered by each instrument. A different steward reviews the agreement and then records its external execution reference. An easement also needs its recording reference.
6. Resolve overlaps and record the methodology assessment. Complete the remaining partner, governance, and authority preparation records before seeking qualified external review.

A consent version is bound to the parcel ID, land reference, recorded area, boundary ID, and boundary geometry. Agreements contain an explicit list of parcels and a snapshot of their status, boundary, and consent versions. Changed land or consent requires replacement records. Revocations take effect immediately in readiness checks; the original review and execution receipts remain available.

Withdrawing a parcel removes it from the proposed pool and preserves its history. This software action does not terminate legal obligations. An agreement covering a withdrawn parcel becomes stale, so its other covered parcels need an appropriately scoped replacement agreement record.

## Geometry and limits

- [Turf area](https://turfjs.org/docs/api/area) computes geodesic square metres from submitted WGS84 boundaries using a spherical Earth model. The threshold assessment uses this calculated area, not an unchecked user-entered total. It remains a drawing-based estimate rather than a cadastral survey.
- Recorded and calculated areas must agree within the larger of **5% of calculated area or 1 m²**. This is a software planning screen, not a program, legal, or survey tolerance.
- [Turf intersect](https://turfjs.org/docs/api/intersect) computes polygonal intersection. Shared edges and corners are permitted. Any positive-area intersection blocks preparation, including duplicate parcels, containment, and overlap with another current project in the same co-op.
- Invalid coordinates, self-intersections, unclosed rings, repeated corners, holes, and polygons spanning more than 10 degrees are rejected. Split unsupported geometry into appropriate separately documented parcels; the application does not silently simplify it.
- The check can only compare records visible to the co-op. It does not search other co-ops, land registries, programs, or external projects. Qualified review must address competing claims and double counting outside this dataset.

## Existing records

Existing parcels, agreements, and receipts remain readable. A legacy area-only assessment or agreement without explicit parcel coverage does not satisfy current preparation checks. There is no automatic consent, rights, or execution backfill.

For existing data, review current boundaries, reconcile any area differences, submit and independently review parcel-specific consent, then submit scoped replacement agreement records. Record a fresh boundary-derived assessment after those land records are current. Existing historical financial receipts are preserved; creating a new issued holding requires current consent, boundary checks, and executed agreement coverage for every included parcel.

## Agent/API operations

Authenticated commands use the same domain rules as the website:

| Operation               | Additional fields                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `record_parcel_consent` | `parcelId`, `holder`, `authority`, `reference`, `scope`, `attested: true`          |
| `review_parcel_consent` | `parcelId`, `id`, `decision: approve/reject`, `note`                               |
| `revoke_parcel_consent` | `parcelId`, `id`, `reason`                                                         |
| `use_boundary_area`     | `parcelId`                                                                         |
| `withdraw_parcel`       | `parcelId`, `reason`                                                               |
| `submit_agreement`      | Existing instrument fields plus nonempty `parcelIds[]` within the selected project |
| `revoke_agreement`      | `id`, `reason`                                                                     |

Stewards cannot independently approve their own submitted consent, agreement, parcel, or boundary version. A recorded area correction keeps the original parcel owner and requires a different reviewer from the person who changed the area.
