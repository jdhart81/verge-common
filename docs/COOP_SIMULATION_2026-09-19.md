# Fictional neighbor-to-co-op rehearsal

This is an **offline simulation using VergeCommon's real domain command handler**. It is not a real co-op, land enrollment, conservation instrument, credit issuance, sale, bank settlement, or payout. It does not test HTTP authentication, persistence, browser controls, external integrations, or production deployment.

Run from the repository with supported Node 22.13+:

```sh
node scripts/simulate-coop-journey.mjs
```

The script creates only local, ignored files under `outputs/coop-simulation/`. It makes no network requests. Each state transition passes through `applyCommand`; members, reviews, consents, votes and financial records are not injected directly into state. All references to legal documents, conservation authority, registries, banks and payments are prominently marked fictional. The phases compress an unspecified multi-year scenario into a short rehearsal; they do not forecast a project schedule.

## Result

The September 19 run completed **100 commands and 19 expected-denial checks**. Rejected commands left the original state unchanged. The final preparation status was `records_prepared_for_external_review`, and three fictional external member-payment receipts were independently reviewed. Actual credits issued, revenue received and payments sent: **zero**.

| Person | Software role | Contribution | Share of member pool |
| --- | --- | --- | --- |
| Maya | Founding steward | West meadow | 40% |
| Theo | Second steward | Middle woodland | 35% |
| Nadia | Member | East wetland edge | 25% |
| Lena | Member and accepted partner representative | Fictional conservation coordination | 0% |

The conservation organization is **FICTIONAL Brook and Canopy Conservation Trust**. It is not a claim about a real organization, registered charity, or authorized representative. Lena's acceptance and co-op review do not confer steward powers.

## Journey exercised

1. **Form a private co-op.** Maya creates the co-op, issues private invitations, approves the three pending memberships and appoints Theo as a second steward. An invite recipient cannot self-approve.
2. **Map three adjoining parcels.** Each landowner records their own parcel and boundary. A different steward reviews each parcel, boundary and parcel-specific pooling consent. The synthetic coordinates are three adjacent `0.003° × 0.003°` polygons near zero degrees; they are not real land parcels. The geodesic pooled area is **333,837.338287 m² / 33.383734 hectares**, with no overlap. Recorded integer area is 111,279 m² per parcel; the geometric area is about 111,279.112762 m² each. Pooling does not transfer ownership.
3. **Bring in the conservation partner.** A reviewed partnership record is linked to the project. Lena accepts the named role, submits her own fictional authority evidence, and Theo performs a separate review. Nadia cannot accept Lena's invitation.
4. **Assemble land and legal records.** The simulation records reviewed co-op authority, a parcel-scoped enrollment agreement, an easement with an external recording reference, carbon-rights authority, and a pathway assessment bound to the current land records. All external references are fictional. The entered 10-hectare threshold is a test setting, not a real methodology criterion.
5. **Adopt a charter.** All four members vote. A steward cannot close early before the deadline unless every eligible member has voted. The charter allocates 20% to stewardship, 10% to treasury and 70% to the member pool.
6. **Record assumed external credits and a settled sale.** A fictional registry receipt supplies 100 serial-numbered units. A second steward reviews it. Another fictional external receipt records 80 units sold and $2,000 cleared. Duplicate serials, unreviewed proceeds and overselling are rejected.
7. **Allocate and record external payment receipts.** Maya creates the allocation and Theo approves it. Each member's fictional bank-payment receipt is reviewed separately. The system prevents duplicate allocations and duplicate member-payment records. A fictional buyer retirement receipt accounts for the 80 transferred units.

## Hypothetical arithmetic

The assumed **100 tCO2e credits are independent of parcel area**. The rehearsal does not calculate carbon, demonstrate additionality, predict yield, establish eligibility, or model monitoring duration. The assumed $25 price is not a quote. External fees are assumed to be **$0 solely to exercise arithmetic**; no financial forecast is implied. The 20 unsold units are uncommitted holdings, **not an official registry buffer**.

| Accounting item | Fictional value |
| --- | ---: |
| Assumed externally issued units | 100 tCO2e |
| Units sold | 80 tCO2e |
| Unsold units | 20 tCO2e |
| Assumed price | $25 per unit |
| Assumed fees | $0 |
| Sale proceeds recorded as cleared | $2,000 |
| Stewardship reserve | $400 |
| Treasury reserve | $200 |
| Member pool | $1,400 |
| Maya member-payment receipt | $560 |
| Theo member-payment receipt | $490 |
| Nadia member-payment receipt | $350 |
| Lena member-payment receipt | $0; no payment due |
| Platform cut | $0 |

Every cent balances. Stewardship and treasury are allocation categories; **their disbursement is not executed or recorded by the member-payment workflow**. In particular, the $400 does not mean the nonprofit received funds.

## Group discussion boundary

The simulation creates one actual private project post and 13 actual comments through `post_update` and `post_comment`. They describe what each participant has done. The executable record of those messages is in `result.json` under `transcript`.

This is the existing project discussion model. The other commands are invoked programmatically by the offline runner. **The simulation does not demonstrate creating a co-op, mapping, signing, voting, selling or paying by typing into chat.** The subsequent [conversation actions build](CONVERSATION_ACTIONS.md) opens the existing structured controls within Discussion; this offline rehearsal does not test that interface. Signatures, integrated buyer execution and payment execution remain external work.

Privacy remains part of the scenario: Nadia's member view receives only her own parcel; Lena receives no private parcels. Stewards can inspect the combined pool. The conversation does not broadcast the neighbors' legal documents, boundaries or authority evidence. No project or discussion appears in the public projection, and an outsider cannot obtain a member view.

## What still happens outside VergeCommon

- Qualified people must establish actual ownership, consent, legal authority, easement execution and recording, and non-overlap outside the co-op.
- A relevant program and verifier must determine eligibility, additionality, permanence, leakage, monitoring, quantified outcomes and issuance. Conserving land alone is not a carbon credit.
- Registry custody, buyer contracting, pricing, trade execution, fees and any required retirement must be established externally.
- Cleared proceeds and authorized payments require real financial arrangements. Current commands record receipts; they do not execute transfers or independently verify banks.
- The current settlement stores a single cash amount. It does not model an itemized trade-fee ledger, tax treatment, or a nonprofit stewardship disbursement.

## Evidence files

- `scripts/simulate-coop-journey.mjs`: repeatable scenario with assertions and expected denials.
- `outputs/coop-simulation/result.json`: sanitized participants, stages, map, exact arithmetic, transcript and rejected-action receipts.
- `outputs/coop-simulation/commands.json`: ordered successful command payloads, actors and audit sequence numbers; all references are synthetic.
- `outputs/coop-simulation/workspace.json`: final fictional aggregate, clearly labeled and ignored by Git.

The scenario script passes scoped lint. A successful offline run establishes this software recordkeeping path, not external facts or production readiness.
