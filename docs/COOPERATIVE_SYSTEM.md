# Verge Common: the cooperative conservation operating system

## Purpose

Apply a member-governed cooperative model to EcoHedge projects and larger conservation parcels. Verge Common connects land commitments, evidence, compatible carbon pools, governance, and benefit distribution. Open code and reusable workflows let other communities adapt the system.

EcoHedge is used here as the user's project category. This release does not define or validate an EcoHedge carbon methodology or assume that every EcoHedge project qualifies for credits.

## Operating loop

1. **Enroll a project.** Identify the authorized landowner, member, private parcel reference, project type, existing rights and encumbrances, and consent.
2. **Establish conservation commitments.** Track the appropriate agreement and easement-holder responsibilities, where applicable. An easement is not a carbon-rights transfer, membership agreement, or carbon methodology.
3. **Build evidence.** Bind the baseline, monitoring period, methodology, uncertainty, additionality, permanence, leakage, and independent review to each project contribution.
4. **Form a compatible pool.** Retain project provenance and group only contributions allowed under the relevant program and method. The co-op administers its own pool subject to verified rights and program rules.
5. **Approve a vintage and allocation policy.** Freeze a member-adopted charter version, ecological reserve policy, and share schedule before distribution.
6. **Record eligible issued holdings.** An external registry or other applicable program establishes actual issuance. Record program, registry, serial ranges, vintage, quantity, current holder, and custody events. Estimates and internal model results are not issued assets.
7. **Record sale and settlement.** Reconcile the authorized transfer with a buyer's actual settled cash receipt. A quoted price, invoice, or modeled sale is not settlement.
8. **Allocate and pay.** Allocate exact cents to approved stewardship costs, treasury reserves, and members. Record authorized payment instructions separately from payment-provider success and bank reconciliation.
9. **Monitor and respond.** Continue obligations, record disturbances and reversals, handle disputes, and apply program and charter rules. Member exit does not erase recorded land obligations or reversal responsibility.

## Roles and ownership

- Landowners authorize commitments and retain rights not conveyed by the applicable instrument.
- The co-op governs its pool, policies, treasury, and distributions within its actual legal authority.
- Qualified easement holders carry their own monitoring and enforcement responsibilities.
- Independent reviewers and applicable carbon programs determine their respective approvals.
- Verge Common supplies software. It does not automatically own land, easements, credits, member votes, or co-op proceeds.
- The platform percentage cut of credit sales is zero. Optional hosting/support could fund maintenance, but is not a current paid offering.

## Domain records

| Record | Required relationship and boundary |
|---|---|
| Cooperative | Legal identity, jurisdiction, member authority, approved charter |
| Member | Consented identity, role, voting rights, approved payout destination |
| Project | EcoHedge or larger parcel; member and private land reference |
| Conservation agreement | Parties, instrument type, reviewed rights, obligations, execution and recording references |
| Evidence envelope | Immutable references/digests, methodology version, period, uncertainty and review |
| Pool/vintage | Co-op, compatible program/method scope, period and retained project provenance |
| Issued lot | Registry/program issuance receipt, serial range, quantity and current custody |
| Charter version | Frozen reserve rules, member allocation schedule and vote record |
| Settlement | Sale reference, currency, cash receipt and reconciliation |
| Allocation | Charter and settlement reference; exact member cents, costs and reserves |
| Payout | Approved instruction, idempotency key, provider receipt and reconciled status |
| Monitoring/reversal | Trigger, evidence, program response, reserve action and member notice |

A federation may coordinate sales across co-ops, but their pools, charters, and liabilities remain separately traceable. Different methods/vintages cannot become interchangeable merely because the software adds their numbers.

## Accounting invariants

The workbench implements **scenario** arithmetic using integer kilograms and integer cents with BigInt intermediates:

- Input contribution = upward-rounded ecological reserve + modeled post-reserve capacity.
- Proposed sale + remaining modeled capacity = post-reserve capacity; an oversale is rejected.
- Modeled proceeds = stewardship budget + treasury reserve + member pool.
- Member shares total exactly 10,000 basis points; member allocations total the exact member pool.
- Fractional member cents use largest remainders and stable member-ID ties.
- Platform sales percentage = zero.

Member shares are draft charter inputs, not automatically inferred from acreage or scenario carbon quantities. A production charter may account for reviewed contribution, connectivity, and labor under explicit approved rules. This release has not implemented or adopted such a formula.

## Current implementation

The shared `/network/` and `/workspace/` system implements durable co-op records, membership and roles, private parcel/consent intake, conservation projects/actions, updates, agreements, private evidence files and reviews, frozen-electorate charter votes, externally documented holdings/settlements, exact allocations, payment/retirement receipt reviews, and linked audit history. See [OPERATIONS.md](OPERATIONS.md) for the complete user flow and boundaries.

The `/coop/` workbench remains a separate hypothetical model. It never promotes scenario outputs into issued holdings or settled cash. The `/demo/` planner remains a device-local supporting tool.

Registry and bank actions are external. The software does not independently authenticate receipts, initiate payments, certify ecology, execute legal instruments, or assert that software governance creates legal authority. Shared records are atomically versioned D1 aggregates; files are private R2 objects. This is a bounded initial implementation, not a claim of large-scale readiness or independent security certification.

## Open easement workflows

The `templates/` directory contains original intake/review scaffolds and draft policy outlines that can be adapted under the repository license. They are not ready-to-sign instruments. The qualified parties and jurisdiction-specific counsel must resolve enforceability, title, rights, permitted uses, recording, tax questions, and monitoring responsibilities. Signed instruments and exact parcel data should remain access-controlled.

## Reference boundaries

- [Land Trust Alliance: conservation easement stewardship](https://landtrustalliance.org/resources/learn/ways-to-learn/learning-paths/ce-stewardship) describes the easement holder's ongoing responsibilities.
- [Verra: grouped projects](https://verra.org/programs/verified-carbon-standard/grouped-projects/) describes a program-specific route for grouping eligible project activities. It is an example, not a selected methodology or approval for Verge Common.
- [Verra: developing a VCS project](https://verra.org/programs/verified-carbon-standard/develop-a-vcs-project/) distinguishes verification approval and issuance requests. Other programs have their own requirements.
