# Co-op actions in the conversation

The member workspace now opens on **Community → Discussion**. Its co-op action selector opens the existing structured forms inside the conversation instead of changing workspace tabs. Actions cover project creation, neighbor invitations, parcel intake, boundary mapping, pooling consent, supporting evidence, conservation partners, parcel agreements, legal authority, benefit-sharing votes, and external credit/payment records.

## What members see

- Landowners work with their own private parcels, evidence, consent and agreement records. Their visible subset never becomes a claim that the whole land pool is ready.
- Stewards can review the shared pool, invitations, partner authority, legal authority and external receipts using the existing independent-review rules.
- A named partner representative can open their own participation invitation and respond explicitly.
- Eligible members can open the benefit-sharing policy and vote before its deadline. Open decisions are suggested before general navigation.
- Archived or capacity-limited workspaces offer record viewing and applicable safety paths. The server still checks every command and the remaining safety storage limit.

## Privacy and explicit actions

An action panel is private to the current viewer. It uses the server's existing member projection and never copies private geometry, documents or financial references into a discussion message. Opening a panel sends no command. Each form still requires its own submission, and a reply such as “I agree” does not record consent, a signature, a vote, a review or a payment.

The pooling-consent confirmation starts unselected. The member must choose it explicitly before submitting the referenced consent for independent review.

The conversation does not create a legal entity, sign conservation instruments, certify carbon, issue or sell registry units, or transfer money. Credit and payment forms record separately obtained external evidence. Agent MCP permissions are unchanged.

## Drafts, refresh and concurrent changes

Closing and reopening an action retains its draft while this conversation remains mounted. Actions that share a destination use one form instance. Changing co-op, role, account or workspace tab can end that draft session; removing access removes the affected private panel immediately when the updated membership response arrives.

Same-workspace refresh keeps forms mounted. A version conflict refreshes the shared records without deleting an unfinished form, then shows the error so the member can review and retry. Saves invalidate earlier pending reads, and background reads do not race an in-flight save. The server's version and replay checks remain authoritative.

## Verification

- 210 Node tests pass, including 11 new tests covering role-specific actions, member projections, partner invitations, agreements, frozen voting eligibility, deadlines, paused activity and next-action order.
- TypeScript, repository lint and the self-hosted production build pass.
- The built self-hosted app passes the four-account HTTP acceptance suite, including persistence, file privacy, conflicts, partner participation, account deletion, native account endpoints and hosted MCP scope restrictions. Acceptance runs used a fresh local database; the earlier shared browser-test instance exhausted its normal account-attempt limit, so no rate limits were weakened.
- Browser review with fictional authenticated accounts exercised a member vote, parcel intake, boundary drawing and saving, parcel-specific consent submission, and the member agreement form entirely within Discussion. Another fictional steward independently reviewed the land, boundary and consent through the API; Nadia's member view did not receive Theo's private parcel. Closing/reopening and same-workspace refresh retained the unfinished form. A concurrent neighbor reply produced a version conflict without losing the parcel draft, and retry saved it. The 390-pixel view had no horizontal overflow; opening and closing returned keyboard focus as expected, with no browser console errors.
- `npm run simulate:coop` runs the fictional neighbor-to-co-op rehearsal: 100 successful commands and 19 expected denials. CI now runs it. See [the simulation report](COOP_SIMULATION_2026-09-19.md) for its scope and hypothetical accounting.

This feature does not itself deploy a website or distribute an Apple app. Release and hosted acceptance evidence must identify the exact revision being run.
