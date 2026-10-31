# Neighbour invitations along a corridor (proposal)

Status: proposal for review. Nothing here is built yet, and nothing here sends a message.

## Why

A forest corridor almost never fits inside one property. When a woodland co-op drafts its old-growth spine, **Find the next woodlots** (`buildOutFrontier`) already lists the recorded woodlots without current consent whose spine touches the committed spine, and the links each would complete. That list is the co-op's natural next conversation. Today a steward has to leave the app to act on it. This proposal closes that gap so each committed woodlot can lead, with consent, to the next one.

## Invariants

1. VergeCommon never looks up, scrapes or infers who owns land. A holder is reached only through a person who already knows them.
2. The app never sends an invitation by itself. A member hands over a private link or printed QR code in person or through their own channel.
3. An invitation grants nothing until a steward approves the request, exactly as today ([PILOT.md](PILOT.md)).
4. Joining never implies consent. A woodlot counts as committed only after its holder's pooling consent is recorded and another steward reviews it ([POOLING_SAFEGUARDS.md](POOLING_SAFEGUARDS.md)).
5. Non-steward members keep today's privacy: they see the build-out only as a co-op total, never which woodlots have or have not consented ([WOODLAND.md](WOODLAND.md#privacy-ws8)).
6. Every invitation created from the frontier is recorded in the audit history with who created it and which frontier row it came from, without the holder's name or contact details.

## Flow

1. A steward runs **Find the next woodlots**.
2. Beside each row, the steward chooses **Prepare an invitation**. The app creates an ordinary expiring co-op invitation and shows:
   - the private link and a printable QR card;
   - a short plain-language note the member can adapt: what the co-op is, what the corridor would connect, and that joining commits nothing;
   - the public `/woodland/` explainer.
3. The steward or the member who recorded that woodlot hands the link over themselves.
4. The holder signs in, requests to join and is approved by a steward. Mapping their own boundary and any consent follow the existing reviewed workflows.
5. When the woodlot's consent is reviewed, the co-op's public progress page (if the co-op has chosen to publish one) shows the larger committed share, which is what the next neighbour sees.

## What to measure

- Invitations prepared from the frontier, requests received, members approved, consents reviewed.
- The share of new woodlots that arrived through a frontier invitation (the co-op's own growth rate).
- Time from invitation to reviewed consent.

Counts are software records, not verified attendance or environmental impact.

## Open questions

- Should a member who is not a steward be able to prepare an invitation for a woodlot they recorded themselves?
- Should the printable card carry the co-op's public progress page, or only the `/woodland/` explainer, for co-ops that publish nothing?
- How long should frontier invitations last? Today's default lifetime may be short for a neighbour met at a town meeting.
